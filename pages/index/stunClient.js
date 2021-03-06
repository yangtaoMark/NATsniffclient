// var dns = require('dns');
// var dgram = require('dgram');

var md5 = require('js-md5');
var Buffer = require('buffer').Buffer;

// Utils


const Utils = Object();
Utils.inetAton =
  function inetAton(a) {
    var d = a.split('.');
    return ((((((+d[0]) * 256) + (+d[1])) * 256) + (+d[2])) * 256) + (+d[3]);
  };

Utils.inetNtoa =
  function inetNtoa(n) {
    var d = n % 256;
    for (var i = 3; i > 0; i--) {
      n = Math.floor(n / 256);
      d = n % 256 + '.' + d;
    }
    return d;
  };

Utils.bufferCompare =
  function bufferCompare(a, b) {
    if (!Buffer.isBuffer(a)) {
      return undefined;
    }
    if (!Buffer.isBuffer(b)) {
      return undefined;
    }
    if (typeof a.equals === 'function') {
      return a.equals(b);
    }
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };




// Const 
const Const = Object();

/**
 * Transport address dependency types.
 * <ul>
 * <li>stun.Type.I: "I" (Independent)</li>
 * <li>stun.Type.PD: "PD" (Port dependent)</li>
 * <li>stun.Type.AD: "AD" (Address dependent)</li>
 * <li>stun.Type.APD: "APD" (Address&Port Dependent)</li>
 * <li>stun.Type.UNDEF: "UNDEF" (Undefined)</li>
 * </ul>
 */
Const.Type = Object.freeze({
  /**
   * Independent. Returns a constant string value of "I".
   */
  I: "I",
  /**
   * Port dependent. Returns a constant string value of "PD".
   */
  PD: "PD",
  /**
   * Address dependent. Returns a constant string value of "AD".
   */
  AD: "AD",
  /**
   * Address and port dependent. Returns a constant string value of "APD".
   */
  APD: "APD",
  /**
   * Type undefined/undetermined. Returns a constant string value of "UNDEF".
   */
  UNDEF: "UNDEF"
});

/**
 * Discovery mode.
 * <ul>
 * <li>stun.Mode.FULL: 0</li>
 * <li>stun.Mode.NB_ONLY: 1</li>
 * </ul>
 */
Const.Mode = Object.freeze({
  /** Performs full NAT type discovery.*/
  FULL: 0,
  /** NAT binding discovery only. */
  NB_ONLY: 1
});

/**
 * Result code.
 * <ul>
 * <li>stun.Result.OK: 0</li>
 * <li>stun.Result.HOST_NOT_FOUND: -1</li>
 * <li>stun.Result.UDP_BLOCKED: -2</li>
 * <li>stun.Result.NB_INCOMPLETE: -3</li>
 * </ul>
 */
Const.Result = Object.freeze({
  /** Successful. */
  OK: 0,
  /** Domain does not exit. (DNS name resolution failed.) */
  HOST_NOT_FOUND: -1,
  /** No reply from server. Server may be down. */
  UDP_BLOCKED: -2,
  /** Partial UDP blockage. NB type discovery was incomplete. */
  NB_INCOMPLETE: -3
});

Const.MesgTypes = Object.freeze({
  "breq": 0x0001,
  "bres": 0x0101,
  "berr": 0x0111, // Not supported
  "sreq": 0x0002, // Not supported
  "sres": 0x0102, // Not supported
  "serr": 0x0112 // Not supported
});

Const.AttrTypes = Object.freeze({
  // RFC 3489
  "mappedAddr": 0x0001,
  "respAddr": 0x0002, // Not supported
  "changeReq": 0x0003,
  "sourceAddr": 0x0004,
  "changedAddr": 0x0005, // Not supported
  "username": 0x0006, // Not supported
  "password": 0x0007, // Not supported
  "msgIntegrity": 0x0008, // Not supported
  "errorCode": 0x0009, // Not supported
  "unknownAttr": 0x000a, // Not supported
  "reflectedFrom": 0x000b, // Not supported
  // RFC 3489bis
  "xorMappedAddr": 0x0020, // Not supported
  // Proprietary.
  "timestamp": 0x0032 // <16:srv-delay><16:tx-timestamp>
});

Const.Families = Object.freeze({
  "ipv4": 0x01
});


// Message 
/**
 * Constructor for StunMessage object.
 * @class
 * @see stun.createMessage()
 */
function Message() {
  this._type = Const.MesgTypes.breq;
  this._tid;
  this._attrs = [];
}

/**
 * @private
 * @static
 */
Message._checkAttrAddr = function(value) {
  if (value["family"] == undefined) {
    value["family"] = "ipv4";
  }
  if (value["port"] == undefined) {
    throw new Error("Port undefined");
  }
  if (value["addr"] == undefined) {
    throw new Error("Addr undefined");
  }
};

/**
 * @private
 * @static
 */
Message._getMesgTypeByVal = function(val) {
  var types = Object.keys(Const.MesgTypes);
  for (var i = 0; i < types.length; ++i) {
    if (Const.MesgTypes[types[i]] == val) {
      return types[i];
    }
  }

  throw new Error("Type undefined: " + val);
};

/**
 * @private
 * @static
 */
Message._getAttrTypeByVal = function(val) {
  var types = Object.keys(Const.AttrTypes);
  for (var i = 0; i < types.length; ++i) {
    if (Const.AttrTypes[types[i]] == val) {
      return types[i];
    }
  }

  throw new Error("Unknown attr value: " + val);
};

/**
 * @private
 * @static
 */
Message._readAddr = function(ctx) {
  var family;
  var port;
  var addr;
  ctx.pos++; // skip first byte
  var families = Object.keys(Const.Families);
  for (var i = 0; i < families.length; ++i) {
    if (Const.Families[families[i]] === ctx.buf[ctx.pos]) {
      family = families[i];
      break;
    }
  }
  if (family == undefined) throw new Error("Unsupported family: " + ctx.buf[ctx.pos]);
  ctx.pos++;

  port = ctx.buf[ctx.pos++] << 8;
  port |= ctx.buf[ctx.pos++];

  // Bit operations can handle only 32-bit values.
  // Here needs to use multiplication instead of
  // shift/or operations to avoid inverting signedness.
  addr = ctx.buf[ctx.pos++] * 0x1000000;
  addr += ctx.buf[ctx.pos++] << 16;
  addr += ctx.buf[ctx.pos++] << 8;
  addr += ctx.buf[ctx.pos++];

  return {
    'family': family,
    'port': port,
    'addr': Utils.inetNtoa(addr)
  };
};

/**
 * @private
 * @static
 */
Message._writeAddr = function(ctx, code, attrVal) {
  if (ctx.buf.length < ctx.pos + 12) {
    throw new Error("Insufficient buffer");
  }

  // Append attribute header.
  ctx.buf[ctx.pos++] = code >> 8;
  ctx.buf[ctx.pos++] = code & 0xff;
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = 0x08;

  // Append attribute value.
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = Const.Families[attrVal.family];
  ctx.buf[ctx.pos++] = attrVal.port >> 8;
  ctx.buf[ctx.pos++] = attrVal.port & 0xff;

  var addr = Utils.inetAton(attrVal.addr);
  ctx.buf[ctx.pos++] = addr >> 24;
  ctx.buf[ctx.pos++] = (addr >> 16) & 0xff;
  ctx.buf[ctx.pos++] = (addr >> 8) & 0xff;
  ctx.buf[ctx.pos++] = addr & 0xff;
};

/**
 * @private
 * @static
 */
Message._readChangeReq = function(ctx) {
  ctx.pos += 3;
  var chIp = false;
  var chPort = false;
  if (ctx.buf[ctx.pos] & 0x4) {
    chIp = true;
  }
  if (ctx.buf[ctx.pos] & 0x2) {
    chPort = true;
  }
  ctx.pos++;

  return {
    'changeIp': chIp,
    'changePort': chPort
  };
};

/**
 * @private
 * @static
 */
Message._writeChangeReq = function(ctx, attrVal) {
  if (ctx.buf.length < ctx.pos + 8) {
    throw new Error("Insufficient buffer");
  }

  // Append attribute header.
  ctx.buf[ctx.pos++] = Const.AttrTypes.changeReq >> 8;
  ctx.buf[ctx.pos++] = Const.AttrTypes.changeReq & 0xff;
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = 0x04;

  // Append attribute value.
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = ((attrVal.changeIp) ? 0x4 : 0x0) | ((attrVal.changePort) ? 0x2 : 0x0);
};

/**
 * @private
 * @static
 */
Message._readTimestamp = function(ctx) {
  var respDelay;
  var timestamp;
  respDelay = ctx.buf[ctx.pos++] << 8;
  respDelay |= ctx.buf[ctx.pos++];
  timestamp = ctx.buf[ctx.pos++] << 8;
  timestamp |= ctx.buf[ctx.pos++];

  return {
    'respDelay': respDelay,
    'timestamp': timestamp
  };
};

/**
 * @private
 * @static
 */
Message._writeTimestamp = function(ctx, attrVal) {
  if (ctx.buf.length < ctx.pos + 8) {
    throw new Error("Insufficient buffer");
  }

  // Append attribute header.
  ctx.buf[ctx.pos++] = Const.AttrTypes.timestamp >> 8;
  ctx.buf[ctx.pos++] = Const.AttrTypes.timestamp & 0xff;
  ctx.buf[ctx.pos++] = 0x00;
  ctx.buf[ctx.pos++] = 0x04;

  // Append attribute value.
  ctx.buf[ctx.pos++] = attrVal.respDelay >> 8;
  ctx.buf[ctx.pos++] = attrVal.respDelay & 0xff;
  ctx.buf[ctx.pos++] = attrVal.timestamp >> 8;
  ctx.buf[ctx.pos++] = attrVal.timestamp & 0xff;
};

/**
 * Initializes Message object.
 */
Message.prototype.init = function() {
  this._type = Const.MesgTypes.breq;
  this._attrs = [];
};

/**
 * Sets STUN message type.
 * @param {string} type Message type.
 * @throws {RangeError} Unknown message type.
 */
Message.prototype.setType = function(type) {
  this._type = Const.MesgTypes[type];
  if (this._type < 0) throw new RangeError("Unknown message type");
};

/**
 * Gets STUN message type.
 * @throws {Error} Type undefined.
 * @type string
 */
Message.prototype.getType = function() {
  var Ctor = this.constructor;
  return Ctor._getMesgTypeByVal(this._type);
};

/**
 * Sets transaction ID.
 * @param {Buffer} tid 16-byte transaction ID.
 */
Message.prototype.setTransactionId = function(tid) {
  this._tid = tid;
};

/**
 * Gets transaction ID.
 * @returns {Buffer} 16-byte Transaction ID.
 */
Message.prototype.getTransactionId = function() {
  return this._tid;
};

/**
 * Adds a STUN attribute.
 * @param {string} attrType Attribute type.
 * @param {object} attrVal Attribute value. Structure of this
 * value varies depending on the type.
 * @throws {RangeError} Unknown attribute type.
 * @throws {Error} The 'changeIp' property is undefined.
 * @throws {Error} The 'changePort' property is undefined.
 */
Message.prototype.addAttribute = function(attrType, attrVal) {
  var Ctor = this.constructor;
  var code = Const.AttrTypes[attrType];
  if (code < 0) {
    throw new RangeError("Unknown attribute type");
  }

  // Validate attrVal
  switch (code) {
    case 0x0001: // mappedAddr
    case 0x0002: // respAddr
    case 0x0004: // sourceAddr
    case 0x0005: // changedAddr
    case 0x0020: // xorMappedAddr
      Ctor._checkAttrAddr(attrVal);
      break;
    case 0x0003: // change-req
      if (attrVal["changeIp"] == undefined) {
        throw new Error("change IP undefined");
      }
      if (attrVal["changePort"] == undefined) {
        throw new Error("change Port undefined");
      }
      break;

    case 0x0032: // timestamp
      if (attrVal.respDelay > 0xffff) {
        attrVal.respDealy = 0xffff;
      }
      if (attrVal.timestamp > 0xffff) {
        attrVal.timestamp = 0xffff;
      }
      break;

    case 0x0006: // username
    case 0x0007: // password
    case 0x0008: // msgIntegrity
    case 0x0009: // errorCode
    case 0x000a: // unknownAttr
    case 0x000b: // reflectedFrom
    default:
      throw new Error("Unsupported attribute " + attrType);
  }

  // If the attribute type already exists, replace it with the new one.
  for (var i = 0; i < this._attrs.length; ++i) {
    if (this._attrs[i].type == attrType) {
      this._attrs[i].value = attrVal;
      return;
    }
  }

  this._attrs.push({
    type: attrType,
    value: attrVal
  });
};

/**
 * Gets a list of STUN attributes.
 * @type array
 */
Message.prototype.getAttributes = function() {
  return this._attrs;
};

/**
 * Gets a STUN attributes by its type.
 * @param {string} attrType Attribute type.
 * @type object
 */
Message.prototype.getAttribute = function(attrType) {
  for (var i = 0; i < this._attrs.length; ++i) {
    if (this._attrs[i].type === attrType) {
      return this._attrs[i].value;
    }
  }

  return null; // the attribute not found.
};

/**
 * Gets byte length a serialized buffer would be.
 * @throws {RangeError}  Unknown attribute type.
 * @type number
 */
Message.prototype.getLength = function() {
  var len = 20; // header size (fixed)
  for (var i = 0; i < this._attrs.length; ++i) {
    var code = Const.AttrTypes[this._attrs[i].type];
    if (code < 0) {
      throw new RangeError("Unknown attribute type");
    }

    // Validate attrVal
    switch (code) {
      case 0x0001: // mappedAddr
      case 0x0002: // respAddr
      case 0x0004: // sourceAddr
      case 0x0005: // changedAddr
      case 0x0020: // xorMappedAddr
        len += 12;
        break;
      case 0x0003: // changeReq
        len += 8;
        break;

      case 0x0032: // timestamp
        len += 8;
        break;

      case 0x0006: // username
      case 0x0007: // password
      case 0x0008: // msgIntegrity
      case 0x0009: // errorCode
      case 0x000a: // unknownAttr
      case 0x000b: // reflectedFrom
      default:
        throw new Error("Unsupported attribute: " + code);
    }
  }

  return len;
};

/**
 * Returns a serialized data of type Buffer.
 * @throws {Error} Incorrect transaction ID.
 * @throws {RangeError}  Unknown attribute type.
 * @type buffer
 */
Message.prototype.serialize = function() {
  var Ctor = this.constructor;
  var ctx = {
    buf: new Buffer(this.getLength()),
    pos: 0
  };
  var i;

  // Write 'Type'
  ctx.buf[ctx.pos++] = this._type >> 8;
  ctx.buf[ctx.pos++] = this._type & 0xff;
  // Write 'Length'
  ctx.buf[ctx.pos++] = (ctx.buf.length - 20) >> 8;
  ctx.buf[ctx.pos++] = (ctx.buf.length - 20) & 0xff;
  // Write 'Transaction ID'
  if (this._tid == undefined || this._tid.length != 16) {
    throw new Error("Incorrect transaction ID");
  }
  for (i = 0; i < 16; ++i) {
    ctx.buf[ctx.pos++] = this._tid[i];
  }

  for (i = 0; i < this._attrs.length; ++i) {
    var code = Const.AttrTypes[this._attrs[i].type];
    if (code < 0) {
      throw new RangeError("Unknown attribute type");
    }

    // Append attribute value
    switch (code) {
      case 0x0001: // mappedAddr
      case 0x0002: // respAddr
      case 0x0004: // sourceAddr
      case 0x0005: // changedAddr
        Ctor._writeAddr(ctx, code, this._attrs[i].value);
        break;
      case 0x0003: // changeReq
        Ctor._writeChangeReq(ctx, this._attrs[i].value);
        break;
      case 0x0032: // timestamp
        Ctor._writeTimestamp(ctx, this._attrs[i].value);
        break;

      case 0x0006: // username
      case 0x0007: // password
      case 0x0008: // msgIntegrity
      case 0x0009: // errorCode
      case 0x000a: // unknownAttr
      case 0x000b: // reflectedFrom
      default:
        throw new Error("Unsupported attribute");
    }
  }

  return ctx.buf;
};

/**
 * Deserializes a serialized data into this object.
 * @param {buffer} buffer Data to be deserialized.
 * @throws {Error} Malformed data in the buffer.
 */
Message.prototype.deserialize = function(buffer) {
  var Ctor = this.constructor;
  var ctx = {
    pos: 0,
    buf: Buffer(buffer)
  };

  // Initialize.
  this._type = 0;
  this._tid = undefined;
  this._attrs = [];

  // buffer must be >= 20 bytes.
  if (ctx.buf.length < 20)
    throw new Error("Malformed data");

  // Parse type.
  this._type = ctx.buf[ctx.pos++] << 8;
  this._type |= ctx.buf[ctx.pos++];

  // Parse length
  var len;
  len = ctx.buf[ctx.pos++] << 8;
  len |= ctx.buf[ctx.pos++];

  // Parse tid.

  this._tid = ctx.buf.slice(ctx.pos, ctx.pos + 16);
  ctx.pos += 16;

  // The remaining length should match the value in the length field.
  if (ctx.buf.length - 20 != len)
    throw new Error("Malformed data 1");

  while (ctx.pos < ctx.buf.length) {
    // Remaining size in the buffer must be >= 4.
    if (ctx.buf.length - ctx.pos < 4)
      throw new Error("Malformed data 2");

    var attrLen;
    var code;

    code = ctx.buf[ctx.pos++] << 8;
    code |= ctx.buf[ctx.pos++];
    attrLen = ctx.buf[ctx.pos++] << 8;
    attrLen |= ctx.buf[ctx.pos++];

    // Remaining size must be >= attrLen.
    if (ctx.buf.length - ctx.pos < attrLen)
      throw new Error("Malformed data: code=" + code + " rem=" + (ctx.buf.length - ctx.pos) + " len=" + attrLen);


    var attrVal;

    switch (code) {
      case 0x0001: // mappedAddAr
      case 0x0002: // respAddr
      case 0x0004: // sourceAddr
      case 0x0005: // changedAddr
        if (attrLen != 8) throw new Error("Malformed data");
        attrVal = Ctor._readAddr(ctx);
        break;
      case 0x0003: // changeReq
        if (attrLen != 4) throw new Error("Malformed data");
        attrVal = Ctor._readChangeReq(ctx);
        break;
      case 0x0032: // xorMappedAddr
        if (attrLen != 4) throw new Error("Malformed data");
        attrVal = Ctor._readTimestamp(ctx);
        break;
      case 0x0006: // username
      case 0x0007: // password
      case 0x0008: // msgIntegrity
      case 0x0009: // errorCode
      case 0x000a: // unknownAttr
      case 0x000b: // reflectedFrom
      default:
        // We do not know of this type.
        // Skip this attribute.
        ctx.pos += attrLen;
        continue;
    }

    this._attrs.push({
      type: Ctor._getAttrTypeByVal(code),
      value: attrVal
    });
  }
};



// Client state
var State = Object.freeze({
  //                src   dst  chIp chPort  breq
  IDLE: 0, //  -----  ---- ---- ------ ------
  RESOLV: 1, //    -     -     -    -       -
  NBDaDp: 2, //  _soc0  DaDp   0    0    _breq0
  NBDaCp: 3, //  _soc0  DaCp   0    0    _breq0
  NBCaDp: 4, //  _soc0  CaDp   0    0    _breq0
  NBCaCp: 5, //  _soc0  CaCp   0    0    _breq0
  EFDiscov: 6, //  _soc0  DaDp   1    1    _breq0
  //  _soc0  DaDp   1    0    _breq1
  COMPLETE: 7
});

function Rtt() {
  this._sum = 0;
  this._num = 0;
  this.init = function() {
    this._sum = 0;
    this._num = 0;
  };
  this.addSample = function(rtt) {
    this._sum += rtt;
    this._num++;
  };
  this.get = function() {
    return this._num ? (this._sum / this._num) : 0;
  };
}

/**
 * Client class.
 * @class
 * @see stun.createClient()
 */
function Client() {
  this._domain; // FQDN
  this._serv0 = "stun.xten.com"; // Dotted decimal.
  this._serv1; // Dotted decimal.
  this._port0 = 3478;
  this._port1; // Obtained via CHANGE-ADDRESS
  this._local = {
    addr: '0.0.0.0',
    port: 0
  };
  this._soc0 = wx.createUDPSocket();
  this._soc1 = wx.createUDPSocket();
  this._breq0; // Binding request 0 of type Message.
  this._breq1; // Binding request 1 of type Message.
  this._state = State.IDLE;
  this._mapped = [{
      addr: 0,
      port: 0
    }, // mapped addr from DaDp
    {
      addr: 0,
      port: 0
    }, // mapped addr from DaCp
    {
      addr: 0,
      port: 0
    }, // mapped addr from CaDp
    {
      addr: 0,
      port: 0
    }
  ]; // mapped addr from CaCp
  // pd ad
  //  0  0 : Independent
  //  0  1 : Address dependent
  //  1  0 : Port dependent (rare)
  //  1  1 : Address & port dependent
  // -1  * : pd check in progress
  //  * -1 : ad check in progress
  this._ef = {
    ad: undefined,
    pd: undefined
  };
  this._numSocs = 0;
  this._cbOnComplete;
  this._cbOnClosed;
  this._intervalId;
  this._retrans = 0; // num of retransmissions
  this._elapsed = 0; // *100 msec
  this._mode = Const.Mode.FULL;
  this._rtt = new Rtt();
}

Client.prototype._onListening = function() {
  this._numSocs++;
  //console.log("this._numSocs++: " + this._numSocs);
};


/**
 * @private
 * @static
 */
Client._isLocalAddr = function(addr, cb) {


  function isPublicIP(ip) {
    function getIPnum(ipAddress) {
      ipAddress = ipAddress.split(".");
      var num = 0;
      for (var i in ipAddress) {
        num = num * 256;
        num = num + parseInt(ipAddress[i]);

      }
      return num;
    }
    if (getIPnum("10.0.0.0") <= getIPnum(ip) && getIPnum(ip) <= getIPnum("10.255.255.255")) {
      return false;
    } else if (getIPnum("172.16.0.0") <= getIPnum(ip) && getIPnum(ip) <= getIPnum("172.31.255.255")) {
      return false;
    } else if (getIPnum("192.168.0.0") <= getIPnum(ip) && getIPnum(ip) <= getIPnum("192.168.255.255")) {
      return false;
    } else if (getIPnum("127.0.0.0") <= getIPnum(ip) && getIPnum(ip) <= getIPnum("127.255.255.255")) {
      return false;
    } else {
      return true;
    }
  }
  if (isPublicIP(addr)) {
    cb(null, false);
  } else {
    cb(null, true);
  }
  // var dummy = dgram.createSocket('udp4');
  // dummy.bind(0, addr, function() {
  //   dummy.close();
  //   cb(null, true);
  // });
  // dummy.on('error', function(err) {
  //   if (err.code !== 'EADDRNOTAVAIL') {
  //     return cb(err);
  //   }
  //   cb(null, false);
  // });

};

Client.prototype._discover = function() {
  var self = this;
  var Ctor = this.constructor;
  // Create socket 0.
  // for wx
  // this._soc0 = dgram.createSocket("udp4");
  // this._soc0 = wx.createUDPSocket();
  // this._soc0.on("listening", function() {
  //   self._onListening();
  // });
  self._soc0.onListening(function() {
    self._onListening();
  });
  // this._soc0.on("message", function(msg, rinfo) {
  //   self._onReceived(msg, rinfo);
  // });
  self._soc0.onMessage(function(res) {
    self._onReceived(res.message, res.remoteInfo);
  });
  // this._soc0.on("close", function() {
  //   self._onClosed();
  // });
  self._soc0.onClose(function() {
    self._onClosed();
  });


  // Start listening on the local port.
  // this._soc0.bind(0, this._local.addr, function() {
  //   // Get assigned port name for this socket.
  //   self._local.addr = self._soc0.address().address;
  //   self._local.port = self._soc0.address().port;

  //   self._breq0 = new Message();
  //   self._breq0.init();
  //   self._breq0.setType('breq');
  //   self._breq0.setTransactionId(Ctor._randTransId());
  //   /*
  //   self._breq0.addAttribute('timestamp', {
  //       'respDelay': 0,
  //       'timestamp': (Date.now() & 0xffff)
  //   });
  //   */

  //   var msg = self._breq0.serialize();
  //   self._soc0.send(msg, 0, msg.length, self._port0, self._serv0);

  //   self._retrans = 0;
  //   self._elapsed = 0;
  //   self._intervalId = setInterval(function() {
  //     self._onTick();
  //   }, 100);
  //   self._state = State.NBDaDp;
  // });
  self._local.addr = this._local.addr;
  self._local.port = this._soc0.bind();
  self._breq0 = new Message();
  self._breq0.init();
  self._breq0.setType('breq');
  self._breq0.setTransactionId(Ctor._randTransId());
  var msg = self._breq0.serialize();
  // self._soc0.send(msg, 0, msg.length, self._port0, self._serv0);
  self._soc0.send({
    address: self._serv0,
    port: self._port0,
    message: msg,
    offset: 0,
    length: msg.length
  });

  self._retrans = 0;
  self._elapsed = 0;
  self._intervalId = setInterval(function() {
    self._onTick();
  }, 100);
  self._state = State.NBDaDp;


};

Client.prototype._onResolved = function(err, addresses) {
  if (err) {
    if (this._cbOnComplete != undefined) {
      this._cbOnComplete(Const.Result.HOST_NOT_FOUND);
    }
    return;
  }

  this._serv0 = addresses[0];
  this._discover();
};



Client.prototype._onClosed = function() {
  if (this._numSocs > 0) {
    this._numSocs--;
    //console.log("this._numSocs--: " + this._numSocs);
    if (this._cbOnClosed != undefined && !this._numSocs) {
      this._cbOnClosed();
    }
  }
};

Client.prototype._onTick = function() {
  var sbuf;

  // this._retrans this._elapsed
  //    0       1( 1)  == Math.min((1 << this._retrans), 16)
  //    1       2( 3)
  //    2       4( 7)
  //    3       8(15)
  //    4      16(31)
  //    5      16(47)
  //    6      16(63)
  //    7      16(79)
  //    8      16(95)

  this._elapsed++;

  if (this._elapsed >= Math.min((1 << this._retrans), 16)) {
    // Retransmission timeout.
    this._retrans++;
    this._elapsed = 0;

    if (this._state == State.NBDaDp ||
      this._state == State.NBDaCp ||
      this._state == State.NBCaDp ||
      this._state == State.NBCaCp) {
      if (this._retrans < 9) {
        /*
        this._breq0.addAttribute('timestamp', {
            'respDelay': 0,
            'timestamp': (Date.now() & 0xffff)
        });
        */
        sbuf = this._breq0.serialize();
        var toAddr;
        var toPort;

        switch (this._state) {
          case State.NBDaDp:
            toAddr = this._serv0;
            toPort = this._port0;
            break;
          case State.NBDaCp:
            toAddr = this._serv0;
            toPort = this._port1;
            break;
          case State.NBCaDp:
            toAddr = this._serv1;
            toPort = this._port0;
            break;
          case State.NBCaCp:
            toAddr = this._serv1;
            toPort = this._port1;
            break;
        }

        // this._soc0.send(sbuf, 0, sbuf.length, toPort, toAddr);
        this._soc0.send({
          address: toAddr,
          port: toPort,
          message: sbuf,
          offset: 0,
          length: sbuf.length
        });
        console.log(
          "NB-Rtx0: len=" + sbuf.length +
          " retrans=" + this._retrans +
          " elapsed=" + this._elapsed +
          " to=" + toAddr +
          ":" + toPort);
      } else {
        clearInterval(this._intervalId);
        var firstNB = (this._state == State.NBDaDp);
        this._state = State.COMPLETE;

        if (this._cbOnComplete != undefined) {
          if (firstNB) {
            this._cbOnComplete(Const.Result.UDP_BLOCKED);
          } else {
            // First binding succeeded, then subsequent
            // binding should work, but didn't.
            this._cbOnComplete(Const.Result.NB_INCOMPLETE);
          }
        }
      }
    } else if (this._state == State.EFDiscov) {
      if (this._ef.ad == undefined) {
        if (this._retrans < 9) {
          sbuf = this._breq0.serialize();
          // this._soc1.send(sbuf, 0, sbuf.length, this._port0, this._serv0);
          this._soc1.send({
            address: this._serv0,
            port: this._port0,
            message: sbuf,
            offset: 0,
            length: sbuf.length
          });
          console.log("EF-Rtx0: retrans=" + this._retrans + " elapsed=" + this._elapsed);
        } else {
          this._ef.ad = 1;
        }
      }
      if (this._ef.pd == undefined) {
        if (this._retrans < 9) {
          sbuf = this._breq1.serialize();
          // this._soc1.send(sbuf, 0, sbuf.length, this._port0, this._serv0);
          this._soc1.send({
            address: this._serv0,
            port: this._port0,
            message: sbuf,
            offset: 0,
            length: sbuf.length
          });
          console.log("EF-Rtx1: retrans=" + this._retrans + " elapsed=" + this._elapsed);
        } else {
          this._ef.pd = 1;
        }
      }
      if (this._ef.ad != undefined && this._ef.pd != undefined) {
        clearInterval(this._intervalId);
        this._state = State.COMPLETE;
        if (this._cbOnComplete != undefined) {
          this._cbOnComplete(Const.Result.OK);
        }
      }
    } else {
      console.log("Warning: unexpected timer event. Forgot to clear timer?");
      clearInterval(this._intervalId);
    }
  }
};

Client.prototype._onReceived = function(msg, rinfo) {
  var self = this;
  var Ctor = this.constructor;
  var bres = new Message();
  var val;
  var now = Date.now();
  var sbuf;
  void rinfo;

  try {
    bres.deserialize(msg);
  } catch (e) {
    console.log("Error: " + e.message);
    return;
  }

  // We are only interested in binding response.
  if (bres.getType() != 'bres') {
    return;
  }

  if (this._state == State.NBDaDp) {
    if (!Utils.bufferCompare(bres.getTransactionId(), this._breq0.getTransactionId())) {
      return; // discard
    }

    clearInterval(this._intervalId);

    // Get MAPPED-ADDRESS value.
    val = bres.getAttribute('mappedAddr');
    if (val == undefined) {
      console.log("Error: MAPPED-ADDRESS not present");
      return;
    }
    this._mapped[0].addr = val.addr;
    this._mapped[0].port = val.port;

    // Check if the mappped address is a local or not (natted)
    if (this._local.addr === '0.0.0.0') {
      Ctor._isLocalAddr(this._mapped[0].addr, function(err, isLocal) {
        if (!err) {
          self._isNatted = !isLocal;
        }
      });
    } else {
      this._isNatted = (this._mapped[0].addr !== this._local.addr);
    }


    // Get CHANGED-ADDRESS value.
    val = bres.getAttribute('changedAddr');
    if (val == undefined) {
      console.log("Error: CHANGED-ADDRESS not present");
      return;
    }
    console.log('CHANGED: addr=%s:%d', val.addr, val.port);
    this._serv1 = val.addr;
    this._port1 = val.port;

    // Calculate RTT if timestamp is attached.
    val = bres.getAttribute('timestamp');
    if (val != undefined) {
      this._rtt.addSample(((now & 0xffff) - val.timestamp) - val.respDelay);
    }

    console.log("MAPPED0: addr=" + this._mapped[0].addr + ":" + this._mapped[0].port);
    //console.log("CHANGED: addr=" + this._serv1 + ":" + this._port1);

    // Start NBDaCp.
    this._breq0.init();
    this._breq0.setType('breq');
    this._breq0.setTransactionId(Ctor._randTransId());
    /*
    this._breq0.addAttribute('timestamp', {
        'respDelay': 0,
        'timestamp': (now & 0xffff)
    });
    */
    sbuf = this._breq0.serialize();
    // this._soc0.send(sbuf, 0, sbuf.length, this._port1, this._serv0);
    this._soc0.send({
      address: this._serv0,
      port: this._port1,
      message: sbuf,
      offset: 0,
      length: sbuf.length
    });
    this._retrans = 0;
    this._elapsed = 0;
    this._intervalId = setInterval(function() {
      self._onTick();
    }, 100);
    this._state = State.NBDaCp;
  } else if (this._state == State.NBDaCp) {
    if (!Utils.bufferCompare(bres.getTransactionId(), this._breq0.getTransactionId())) {
      return; // discard
    }

    clearInterval(this._intervalId);

    // Get MAPPED-ADDRESS value.
    val = bres.getAttribute('mappedAddr');
    if (val == undefined) {
      console.log("Error: MAPPED-ADDRESS not present");
      return;
    }
    this._mapped[1].addr = val.addr;
    this._mapped[1].port = val.port;

    // Calculate RTT if timestamp is attached.
    val = bres.getAttribute('timestamp');
    if (val != undefined) {
      this._rtt.addSample(((now & 0xffff) - val.timestamp) - val.respDelay);
    }

    console.log("MAPPED1: addr=" + this._mapped[1].addr + ":" + this._mapped[1].port);

    // Start NBCaDp.
    this._breq0.init();
    this._breq0.setType('breq');
    this._breq0.setTransactionId(Ctor._randTransId());
    /*
    this._breq0.addAttribute('timestamp', {
        'respDelay': 0,
        'timestamp': (now & 0xffff)
    });
    */
    sbuf = this._breq0.serialize();
    // this._soc0.send(sbuf, 0, sbuf.length, this._port0, this._serv1);
    this._soc0.send({
      address: this._serv1,
      port: this._port0,
      message: sbuf,
      offset: 0,
      length: sbuf.length
    });
    this._retrans = 0;
    this._elapsed = 0;
    this._intervalId = setInterval(function() {
      self._onTick();
    }, 100);
    this._state = State.NBCaDp;
  } else if (this._state == State.NBCaDp) {
    if (!Utils.bufferCompare(bres.getTransactionId(), this._breq0.getTransactionId())) {
      return; // discard
    }

    clearInterval(this._intervalId);

    // Get MAPPED-ADDRESS value.
    val = bres.getAttribute('mappedAddr');
    if (val == undefined) {
      console.log("Error: MAPPED-ADDRESS not present");
      return;
    }
    this._mapped[2].addr = val.addr;
    this._mapped[2].port = val.port;

    // Calculate RTT if timestamp is attached.
    val = bres.getAttribute('timestamp');
    if (val != undefined) {
      this._rtt.addSample(((now & 0xffff) - val.timestamp) - val.respDelay);
    }

    console.log("MAPPED2: addr=" + this._mapped[2].addr + ":" + this._mapped[2].port);

    // Start NBCaCp.
    this._breq0.init();
    this._breq0.setType('breq');
    this._breq0.setTransactionId(Ctor._randTransId());
    /*
    this._breq0.addAttribute('timestamp', {
        'respDelay': 0,
        'timestamp': (now & 0xffff)
    });
    */
    sbuf = this._breq0.serialize();
    // this._soc0.send(sbuf, 0, sbuf.length, this._port1, this._serv1);
    this._soc0.send({
      address: this._serv1,
      port: this._port1,
      message: sbuf,
      offset: 0,
      length: sbuf.length
    });
    this._retrans = 0;
    this._elapsed = 0;
    this._intervalId = setInterval(function() {
      self._onTick();
    }, 100);
    this._state = State.NBCaCp;
  } else if (this._state == State.NBCaCp) {
    if (!Utils.bufferCompare(bres.getTransactionId(), this._breq0.getTransactionId())) {
      return; // discard
    }

    clearInterval(this._intervalId);

    // Get MAPPED-ADDRESS value.
    val = bres.getAttribute('mappedAddr');
    if (val == undefined) {
      console.log("Error: MAPPED-ADDRESS not present");
      return;
    }
    this._mapped[3].addr = val.addr;
    this._mapped[3].port = val.port;

    // Calculate RTT if timestamp is attached.
    val = bres.getAttribute('timestamp');
    if (val != undefined) {
      this._rtt.addSample(((now & 0xffff) - val.timestamp) - val.respDelay);
    }

    console.log("MAPPED3: addr=" + this._mapped[3].addr + ":" + this._mapped[3].port);

    // Start NBDiscov.
    this._ef.ad = undefined;
    this._ef.pd = undefined;

    // Create another socket (this._soc1) from which EFDiscov is performed).
    // this._soc1 = dgram.createSocket("udp4");
    // this._soc1 = wx.createUDPSocket();
    // this._soc1.on("listening", function() {
    //   self._onListening();
    // });
    this._soc1.onListening(function() {
      self._onListening();
    });
    // this._soc1.on("message", function(msg, rinfo) {
    //   self._onReceived(msg, rinfo);
    // });
    this._soc1.onMessage(function(res) {
      self._onReceived(res.message, res.remoteInfo);
    });
    // this._soc1.on("close", function() {
    //   self._onClosed();
    // });
    this._soc1.onClose(function() {
      self._onClosed();
    })

    // Start listening on the local port.
    // this._soc1.bind(0, this._local.addr);
    this._soc1.bind();
    // changeIp=true,changePort=true from this._soc1
    this._breq0.init();
    this._breq0.setType('breq');
    this._breq0.setTransactionId(Ctor._randTransId());
    this._breq0.addAttribute('changeReq', {
      'changeIp': true,
      'changePort': true
    });

    sbuf = this._breq0.serialize();
    // this._soc1.send(sbuf, 0, sbuf.length, this._port0, this._serv0);
    this._soc1.send({
      address: this._serv0,
      port: this._port0,
      message: sbuf,
      offset: 0,
      length: sbuf.length
    });
    // changeIp=false,changePort=true from this._soc1
    this._breq1 = new Message();
    this._breq1.setType('breq');
    this._breq1.setTransactionId(Ctor._randTransId());
    this._breq1.addAttribute('changeReq', {
      'changeIp': false,
      'changePort': true
    });

    sbuf = this._breq1.serialize();
    // this._soc1.send(sbuf, 0, sbuf.length, this._port0, this._serv0);
    this._soc1.send({
      address: this._serv0,
      port: this._port0,
      message: sbuf,
      offset: 0,
      length: sbuf.length
    });
    this._retrans = 0;
    this._elapsed = 0;
    this._intervalId = setInterval(function() {
      self._onTick();
    }, 100);
    this._state = State.EFDiscov;
  } else if (this._state == State.EFDiscov) {
    var res = -1;
    if (this._ef.ad == undefined) {
      if (Utils.bufferCompare(bres.getTransactionId(), this._breq0.getTransactionId())) {
        res = 0;
      }
    }
    if (res < 0 && this._ef.pd == undefined) {
      if (Utils.bufferCompare(bres.getTransactionId(), this._breq1.getTransactionId())) {
        res = 1;
      }
    }

    if (res < 0) {
      return; // discard
    }

    if (res == 0) {
      this._ef.ad = 0;
    } else {
      this._ef.pd = 0;
    }

    if (this._ef.ad !== undefined && this._ef.pd !== undefined) {
      clearInterval(this._intervalId);
      this._state = State.COMPLETE;
      if (this._cbOnComplete) {
        this._cbOnComplete(Const.Result.OK);
      }
    }
  } else {
    return; // discard
  }

};

/**
 * @private
 * @static
 * @returns {Buffer} Returns a 16-random-bytes.
 */
Client._randTransId = function() {
  // var seed = process.pid.toString(16);
  var seed = Math.round(Math.random() * 0x100000000).toString(16);
  seed += (new Date()).getTime().toString(16);
  return Buffer(md5.arrayBuffer(seed));
};

/**
 * Sets local address. Use of this method is optional. If your
 * local device has more then one interfaces, you can specify
 * one of these interfaces form which STUN is performed.
 * @param {string} addr Local IP address.
 * @throws {Error} The address not available.
 */
Client.prototype.setLocalAddr = function(addr) {
  this._local.addr = addr;
  this._local.port = 0;
};

/**
 * Sets STUN server address.
 * @param {string} addr Domain name of the STUN server. Dotted
 * decimal IP address can be used.
 * @param {number} port Port number of the STUN server. If not
 * defined, default port number 3478 will be used.
 */
Client.prototype.setServerAddr = function(addr, port) {
  var d = addr.split('.');
  if (d.length != 4 || (
      isNaN(parseInt(d[0])) ||
      isNaN(parseInt(d[1])) ||
      isNaN(parseInt(d[2])) ||
      isNaN(parseInt(d[3])))) {
    this._domain = addr;
    this._serv0 = undefined;
  } else {
    this._domain = undefined;
    this._serv0 = addr;
  }

  if (port != undefined) {
    this._port0 = port;
  }
};

/**
 * Starts NAT discovery.
 * @param {object} [option]. Options.
 * @param {boolean} [option.bindingOnly] Perform NAT binding only. Otheriwse
 * perform full NAT discovery process.
 * @param {function} cb Callback made when NAT discovery is complete.
 * The callback function takes an argument, a result code of type {number}
 * defined as stun.Result.
 * @see stun.Result
 * @throws {Error} STUN is already in progress.
 * @throws {Error} STUN server address is not defined yet.
 */
Client.prototype.start = function(option, cb) {
  if (typeof option !== 'object') {
    cb = option;
    option = {};
  }

  // Sanity check
  if (this._state !== State.IDLE)
    throw new Error("Not allowed in state " + this._state);
  if (!this._domain && !this._serv0)
    throw new Error("Address undefined");

  this._cbOnComplete = cb;
  this._mode = (option && option.bindingOnly) ? Const.NB_ONLY : Const.Mode.FULL;

  // Initialize.
  this._rtt.init();

  if (!this._serv0) {
    // dns.resolve4(this._domain, this._onResolved.bind(this));
    this._state = State.RESOLV;
  } else {
    this._discover();
  }
};

/**
 * Closes STUN client.
 * @param {function} callback Callback made when UDP sockets in use
 * are all closed.
 */
Client.prototype.close = function(callback) {
  this._cbOnClosed = callback;
  if (this._soc0) {
    this._soc0.close();
  }
  if (this._soc1) {
    this._soc1.close();
  }
};

/**
 * Tells whether we are behind a NAT or not.
 * @type boolean
 */
Client.prototype.isNatted = function() {
  return this._isNatted;
};

/**
 * Gets NAT binding type.
 * @type string
 * @see stun.Type
 */
Client.prototype.getNB = function() {
  if (!this.isNatted()) {
    return Const.Type.I;
  }

  if (this._mapped[1].addr && this._mapped[2].addr && this._mapped[3].addr) {
    if (this._mapped[0].port == this._mapped[2].port) {
      if (this._mapped[0].port == this._mapped[1].port) {
        return Const.Type.I;
      }
      return Const.Type.PD;
    }

    if (this._mapped[0].port == this._mapped[1].port) {
      return Const.Type.AD;
    }
    return Const.Type.APD;
  }

  return Const.Type.UNDEF;
};

/**
 * Gets endpoint filter type.
 * @type string
 * @see stun.Type
 */
Client.prototype.getEF = function() {
  if (this.isNatted() == undefined) {
    return Const.Type.UNDEF;
  }

  if (!this.isNatted()) {
    return Const.Type.I;
  }

  if (this._ef.ad == undefined) {
    return Const.Type.UNDEF;
  }

  if (this._ef.pd == undefined) {
    return Const.Type.UNDEF;
  }

  if (this._ef.ad == 0) {
    if (this._ef.pd == 0) {
      return Const.Type.I;
    }
    return Const.Type.PD;
  }

  if (this._ef.pd == 0) {
    return Const.Type.AD;
  }
  return Const.Type.APD;
};

/**
 * Gets name of NAT type.
 * @type string
 */
Client.prototype.getNatType = function() {
  var natted = this.isNatted();
  var nb = this.getNB();
  var ef = this.getEF();

  if (natted == undefined) return "UDP blocked";
  if (!natted) return "Open to internet";
  if (nb == Const.Type.UNDEF || ef == Const.Type.UNDEF)
    return "Natted (details not available)";

  if (nb == Const.Type.I) {
    // Cone.
    if (ef == Const.Type.I) return "Full cone";
    if (ef == Const.Type.PD) return "Port-only-restricted cone";
    if (ef == Const.Type.AD) return "Address-restricted cone";
    return "Port-restricted cone";
  }

  return "Symmetric";
};

/**
 * Gets mapped address (IP address & port) returned by STUN server.
 * @type object
 */
Client.prototype.getMappedAddr = function() {
  return {
    address: this._mapped[0].addr,
    port: this._mapped[0].port
  };
};

/**
 * Gets RTT (Round-Trip Time) in milliseconds measured during
 * NAT binding discovery.
 * @type number
 */
Client.prototype.getRtt = function() {
  return this._rtt.get();
};




// init
exports.createClient = function() {
  return new Client();
};