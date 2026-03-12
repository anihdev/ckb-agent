"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  initializeConfig: true,
  getConfig: true,
  validateConfig: true,
  nameOfScript: true,
  findConfigByScript: true,
  helpers: true,
  predefined: true,
  createConfig: true,
  generateGenesisScriptConfigs: true,
  refreshScriptConfigs: true,
  createRpcResolver: true,
  createLatestTypeIdResolver: true
};
Object.defineProperty(exports, "createConfig", {
  enumerable: true,
  get: function () {
    return _predefined.createConfig;
  }
});
Object.defineProperty(exports, "createLatestTypeIdResolver", {
  enumerable: true,
  get: function () {
    return _refresh.createLatestTypeIdResolver;
  }
});
Object.defineProperty(exports, "createRpcResolver", {
  enumerable: true,
  get: function () {
    return _refresh.createRpcResolver;
  }
});
Object.defineProperty(exports, "findConfigByScript", {
  enumerable: true,
  get: function () {
    return _helpers.findConfigByScript;
  }
});
Object.defineProperty(exports, "generateGenesisScriptConfigs", {
  enumerable: true,
  get: function () {
    return _genesis.generateGenesisScriptConfigs;
  }
});
Object.defineProperty(exports, "getConfig", {
  enumerable: true,
  get: function () {
    return _manager.getConfig;
  }
});
exports.helpers = void 0;
Object.defineProperty(exports, "initializeConfig", {
  enumerable: true,
  get: function () {
    return _manager.initializeConfig;
  }
});
Object.defineProperty(exports, "nameOfScript", {
  enumerable: true,
  get: function () {
    return _helpers.nameOfScript;
  }
});
Object.defineProperty(exports, "predefined", {
  enumerable: true,
  get: function () {
    return _predefined.predefined;
  }
});
Object.defineProperty(exports, "refreshScriptConfigs", {
  enumerable: true,
  get: function () {
    return _refresh.refreshScriptConfigs;
  }
});
Object.defineProperty(exports, "validateConfig", {
  enumerable: true,
  get: function () {
    return _manager.validateConfig;
  }
});
var _types = require("./types");
Object.keys(_types).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _types[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _types[key];
    }
  });
});
var _manager = require("./manager");
var _helpers = _interopRequireWildcard(require("./helpers"));
exports.helpers = _helpers;
var _predefined = require("./predefined");
var _genesis = require("./genesis");
var _refresh = require("./refresh");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
//# sourceMappingURL=index.js.map