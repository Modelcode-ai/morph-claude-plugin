#!/usr/bin/env node
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// node_modules/fast-xml-parser/src/util.js
var require_util = __commonJS((exports) => {
  var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
  var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
  var regexName = new RegExp("^" + nameRegexp + "$");
  var getAllMatches = function(string, regex) {
    const matches = [];
    let match = regex.exec(string);
    while (match) {
      const allmatches = [];
      allmatches.startIndex = regex.lastIndex - match[0].length;
      const len = match.length;
      for (let index = 0;index < len; index++) {
        allmatches.push(match[index]);
      }
      matches.push(allmatches);
      match = regex.exec(string);
    }
    return matches;
  };
  var isName = function(string) {
    const match = regexName.exec(string);
    return !(match === null || typeof match === "undefined");
  };
  exports.isExist = function(v) {
    return typeof v !== "undefined";
  };
  exports.isEmptyObject = function(obj) {
    return Object.keys(obj).length === 0;
  };
  exports.merge = function(target, a, arrayMode) {
    if (a) {
      const keys = Object.keys(a);
      const len = keys.length;
      for (let i = 0;i < len; i++) {
        if (arrayMode === "strict") {
          target[keys[i]] = [a[keys[i]]];
        } else {
          target[keys[i]] = a[keys[i]];
        }
      }
    }
  };
  exports.getValue = function(v) {
    if (exports.isExist(v)) {
      return v;
    } else {
      return "";
    }
  };
  var DANGEROUS_PROPERTY_NAMES = [
    "hasOwnProperty",
    "toString",
    "valueOf",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__"
  ];
  var criticalProperties = ["__proto__", "constructor", "prototype"];
  exports.isName = isName;
  exports.getAllMatches = getAllMatches;
  exports.nameRegexp = nameRegexp;
  exports.DANGEROUS_PROPERTY_NAMES = DANGEROUS_PROPERTY_NAMES;
  exports.criticalProperties = criticalProperties;
});

// node_modules/fast-xml-parser/src/validator.js
var require_validator = __commonJS((exports) => {
  var util = require_util();
  var defaultOptions = {
    allowBooleanAttributes: false,
    unpairedTags: []
  };
  exports.validate = function(xmlData, options) {
    options = Object.assign({}, defaultOptions, options);
    const tags = [];
    let tagFound = false;
    let reachedRoot = false;
    if (xmlData[0] === "\uFEFF") {
      xmlData = xmlData.substr(1);
    }
    for (let i = 0;i < xmlData.length; i++) {
      if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
        i += 2;
        i = readPI(xmlData, i);
        if (i.err)
          return i;
      } else if (xmlData[i] === "<") {
        let tagStartPos = i;
        i++;
        if (xmlData[i] === "!") {
          i = readCommentAndCDATA(xmlData, i);
          continue;
        } else {
          let closingTag = false;
          if (xmlData[i] === "/") {
            closingTag = true;
            i++;
          }
          let tagName = "";
          for (;i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "\t" && xmlData[i] !== `
` && xmlData[i] !== "\r"; i++) {
            tagName += xmlData[i];
          }
          tagName = tagName.trim();
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substring(0, tagName.length - 1);
            i--;
          }
          if (!validateTagName(tagName)) {
            let msg;
            if (tagName.trim().length === 0) {
              msg = "Invalid space after '<'.";
            } else {
              msg = "Tag '" + tagName + "' is an invalid name.";
            }
            return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
          }
          const result = readAttributeStr(xmlData, i);
          if (result === false) {
            return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
          }
          let attrStr = result.value;
          i = result.index;
          if (attrStr[attrStr.length - 1] === "/") {
            const attrStrStart = i - attrStr.length;
            attrStr = attrStr.substring(0, attrStr.length - 1);
            const isValid = validateAttributeString(attrStr, options);
            if (isValid === true) {
              tagFound = true;
            } else {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
            }
          } else if (closingTag) {
            if (!result.tagClosed) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
            } else if (attrStr.trim().length > 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
            } else if (tags.length === 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
            } else {
              const otg = tags.pop();
              if (tagName !== otg.tagName) {
                let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
                return getErrorObject("InvalidTag", "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.", getLineNumberForPosition(xmlData, tagStartPos));
              }
              if (tags.length == 0) {
                reachedRoot = true;
              }
            }
          } else {
            const isValid = validateAttributeString(attrStr, options);
            if (isValid !== true) {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
            }
            if (reachedRoot === true) {
              return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
            } else if (options.unpairedTags.indexOf(tagName) !== -1) {} else {
              tags.push({ tagName, tagStartPos });
            }
            tagFound = true;
          }
          for (i++;i < xmlData.length; i++) {
            if (xmlData[i] === "<") {
              if (xmlData[i + 1] === "!") {
                i++;
                i = readCommentAndCDATA(xmlData, i);
                continue;
              } else if (xmlData[i + 1] === "?") {
                i = readPI(xmlData, ++i);
                if (i.err)
                  return i;
              } else {
                break;
              }
            } else if (xmlData[i] === "&") {
              const afterAmp = validateAmpersand(xmlData, i);
              if (afterAmp == -1)
                return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
              i = afterAmp;
            } else {
              if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
                return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
              }
            }
          }
          if (xmlData[i] === "<") {
            i--;
          }
        }
      } else {
        if (isWhiteSpace(xmlData[i])) {
          continue;
        }
        return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
      }
    }
    if (!tagFound) {
      return getErrorObject("InvalidXml", "Start tag expected.", 1);
    } else if (tags.length == 1) {
      return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
    } else if (tags.length > 0) {
      return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
    }
    return true;
  };
  function isWhiteSpace(char) {
    return char === " " || char === "\t" || char === `
` || char === "\r";
  }
  function readPI(xmlData, i) {
    const start = i;
    for (;i < xmlData.length; i++) {
      if (xmlData[i] == "?" || xmlData[i] == " ") {
        const tagname = xmlData.substr(start, i - start);
        if (i > 5 && tagname === "xml") {
          return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
        } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
          i++;
          break;
        } else {
          continue;
        }
      }
    }
    return i;
  }
  function readCommentAndCDATA(xmlData, i) {
    if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
      for (i += 3;i < xmlData.length; i++) {
        if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
      let angleBracketsCount = 1;
      for (i += 8;i < xmlData.length; i++) {
        if (xmlData[i] === "<") {
          angleBracketsCount++;
        } else if (xmlData[i] === ">") {
          angleBracketsCount--;
          if (angleBracketsCount === 0) {
            break;
          }
        }
      }
    } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
      for (i += 8;i < xmlData.length; i++) {
        if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    }
    return i;
  }
  var doubleQuote = '"';
  var singleQuote = "'";
  function readAttributeStr(xmlData, i) {
    let attrStr = "";
    let startChar = "";
    let tagClosed = false;
    for (;i < xmlData.length; i++) {
      if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
        if (startChar === "") {
          startChar = xmlData[i];
        } else if (startChar !== xmlData[i]) {} else {
          startChar = "";
        }
      } else if (xmlData[i] === ">") {
        if (startChar === "") {
          tagClosed = true;
          break;
        }
      }
      attrStr += xmlData[i];
    }
    if (startChar !== "") {
      return false;
    }
    return {
      value: attrStr,
      index: i,
      tagClosed
    };
  }
  var validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
  function validateAttributeString(attrStr, options) {
    const matches = util.getAllMatches(attrStr, validAttrStrRegxp);
    const attrNames = {};
    for (let i = 0;i < matches.length; i++) {
      if (matches[i][1].length === 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] !== undefined && matches[i][4] === undefined) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] === undefined && !options.allowBooleanAttributes) {
        return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
      }
      const attrName = matches[i][2];
      if (!validateAttrName(attrName)) {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
      }
      if (!attrNames.hasOwnProperty(attrName)) {
        attrNames[attrName] = 1;
      } else {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
      }
    }
    return true;
  }
  function validateNumberAmpersand(xmlData, i) {
    let re = /\d/;
    if (xmlData[i] === "x") {
      i++;
      re = /[\da-fA-F]/;
    }
    for (;i < xmlData.length; i++) {
      if (xmlData[i] === ";")
        return i;
      if (!xmlData[i].match(re))
        break;
    }
    return -1;
  }
  function validateAmpersand(xmlData, i) {
    i++;
    if (xmlData[i] === ";")
      return -1;
    if (xmlData[i] === "#") {
      i++;
      return validateNumberAmpersand(xmlData, i);
    }
    let count = 0;
    for (;i < xmlData.length; i++, count++) {
      if (xmlData[i].match(/\w/) && count < 20)
        continue;
      if (xmlData[i] === ";")
        break;
      return -1;
    }
    return i;
  }
  function getErrorObject(code, message, lineNumber) {
    return {
      err: {
        code,
        msg: message,
        line: lineNumber.line || lineNumber,
        col: lineNumber.col
      }
    };
  }
  function validateAttrName(attrName) {
    return util.isName(attrName);
  }
  function validateTagName(tagname) {
    return util.isName(tagname);
  }
  function getLineNumberForPosition(xmlData, index) {
    const lines = xmlData.substring(0, index).split(/\r?\n/);
    return {
      line: lines.length,
      col: lines[lines.length - 1].length + 1
    };
  }
  function getPositionFromMatch(match) {
    return match.startIndex + match[1].length;
  }
});

// node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var require_OptionsBuilder = __commonJS((exports) => {
  var { DANGEROUS_PROPERTY_NAMES, criticalProperties } = require_util();
  var defaultOnDangerousProperty = (name) => {
    if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return "__" + name;
    }
    return name;
  };
  var defaultOptions = {
    preserveOrder: false,
    attributeNamePrefix: "@_",
    attributesGroupName: false,
    textNodeName: "#text",
    ignoreAttributes: true,
    removeNSPrefix: false,
    allowBooleanAttributes: false,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
    cdataPropName: false,
    numberParseOptions: {
      hex: true,
      leadingZeros: true,
      eNotation: true
    },
    tagValueProcessor: function(tagName, val) {
      return val;
    },
    attributeValueProcessor: function(attrName, val) {
      return val;
    },
    stopNodes: [],
    alwaysCreateTextNode: false,
    isArray: () => false,
    commentPropName: false,
    unpairedTags: [],
    processEntities: true,
    htmlEntities: false,
    ignoreDeclaration: false,
    ignorePiTags: false,
    transformTagName: false,
    transformAttributeName: false,
    updateTag: function(tagName, jPath, attrs) {
      return tagName;
    },
    captureMetaData: false,
    maxNestedTags: 100,
    strictReservedNames: true,
    onDangerousProperty: defaultOnDangerousProperty
  };
  function validatePropertyName(propertyName, optionName) {
    if (typeof propertyName !== "string") {
      return;
    }
    const normalized = propertyName.toLowerCase();
    if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(`[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`);
    }
    if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(`[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`);
    }
  }
  function normalizeProcessEntities(value) {
    if (typeof value === "boolean") {
      return {
        enabled: value,
        maxEntitySize: 1e4,
        maxExpansionDepth: 10,
        maxTotalExpansions: 1000,
        maxExpandedLength: 1e5,
        allowedTags: null,
        tagFilter: null
      };
    }
    if (typeof value === "object" && value !== null) {
      return {
        enabled: value.enabled !== false,
        maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
        maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
        maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
        maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
        maxEntityCount: Math.max(1, value.maxEntityCount ?? 1000),
        allowedTags: value.allowedTags ?? null,
        tagFilter: value.tagFilter ?? null
      };
    }
    return normalizeProcessEntities(true);
  }
  var buildOptions = function(options) {
    const built = Object.assign({}, defaultOptions, options);
    const propertyNameOptions = [
      { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
      { value: built.attributesGroupName, name: "attributesGroupName" },
      { value: built.textNodeName, name: "textNodeName" },
      { value: built.cdataPropName, name: "cdataPropName" },
      { value: built.commentPropName, name: "commentPropName" }
    ];
    for (const { value, name } of propertyNameOptions) {
      if (value) {
        validatePropertyName(value, name);
      }
    }
    if (built.onDangerousProperty === null) {
      built.onDangerousProperty = defaultOnDangerousProperty;
    }
    built.processEntities = normalizeProcessEntities(built.processEntities);
    return built;
  };
  exports.buildOptions = buildOptions;
  exports.defaultOptions = defaultOptions;
});

// node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var require_xmlNode = __commonJS((exports, module) => {
  class XmlNode {
    constructor(tagname) {
      this.tagname = tagname;
      this.child = [];
      this[":@"] = {};
    }
    add(key, val) {
      if (key === "__proto__")
        key = "#__proto__";
      this.child.push({ [key]: val });
    }
    addChild(node) {
      if (node.tagname === "__proto__")
        node.tagname = "#__proto__";
      if (node[":@"] && Object.keys(node[":@"]).length > 0) {
        this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
      } else {
        this.child.push({ [node.tagname]: node.child });
      }
    }
  }
  module.exports = XmlNode;
});

// node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
var require_DocTypeReader = __commonJS((exports, module) => {
  var util = require_util();

  class DocTypeReader {
    constructor(options) {
      this.suppressValidationErr = !options;
      this.options = options || {};
    }
    readDocType(xmlData, i) {
      const entities = Object.create(null);
      let entityCount = 0;
      if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
        i = i + 9;
        let angleBracketsCount = 1;
        let hasBody = false, comment = false;
        let exp = "";
        for (;i < xmlData.length; i++) {
          if (xmlData[i] === "<" && !comment) {
            if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
              i += 7;
              let entityName, val;
              [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
              if (val.indexOf("&") === -1) {
                if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                  throw new Error(`Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`);
                }
                const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                entities[entityName] = {
                  regx: RegExp(`&${escaped};`, "g"),
                  val
                };
                entityCount++;
              }
            } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
              i += 8;
              const { index } = this.readElementExp(xmlData, i + 1);
              i = index;
            } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
              i += 8;
            } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
              i += 9;
              const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
              i = index;
            } else if (hasSeq(xmlData, "!--", i)) {
              comment = true;
            } else {
              throw new Error(`Invalid DOCTYPE`);
            }
            angleBracketsCount++;
            exp = "";
          } else if (xmlData[i] === ">") {
            if (comment) {
              if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                comment = false;
                angleBracketsCount--;
              }
            } else {
              angleBracketsCount--;
            }
            if (angleBracketsCount === 0) {
              break;
            }
          } else if (xmlData[i] === "[") {
            hasBody = true;
          } else {
            exp += xmlData[i];
          }
        }
        if (angleBracketsCount !== 0) {
          throw new Error(`Unclosed DOCTYPE`);
        }
      } else {
        throw new Error(`Invalid Tag instead of DOCTYPE`);
      }
      return { entities, i };
    }
    readEntityExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let entityName = "";
      while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
        entityName += xmlData[i];
        i++;
      }
      validateEntityName(entityName);
      i = skipWhitespace(xmlData, i);
      if (!this.suppressValidationErr) {
        if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
          throw new Error("External entities are not supported");
        } else if (xmlData[i] === "%") {
          throw new Error("Parameter entities are not supported");
        }
      }
      let entityValue = "";
      [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
      if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
        throw new Error(`Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`);
      }
      i--;
      return [entityName, entityValue, i];
    }
    readNotationExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let notationName = "";
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        notationName += xmlData[i];
        i++;
      }
      !this.suppressValidationErr && validateEntityName(notationName);
      i = skipWhitespace(xmlData, i);
      const identifierType = xmlData.substring(i, i + 6).toUpperCase();
      if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
        throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
      }
      i += identifierType.length;
      i = skipWhitespace(xmlData, i);
      let publicIdentifier = null;
      let systemIdentifier = null;
      if (identifierType === "PUBLIC") {
        [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] === '"' || xmlData[i] === "'") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        }
      } else if (identifierType === "SYSTEM") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        if (!this.suppressValidationErr && !systemIdentifier) {
          throw new Error("Missing mandatory system identifier for SYSTEM notation");
        }
      }
      return { notationName, publicIdentifier, systemIdentifier, index: --i };
    }
    readIdentifierVal(xmlData, i, type) {
      let identifierVal = "";
      const startChar = xmlData[i];
      if (startChar !== '"' && startChar !== "'") {
        throw new Error(`Expected quoted string, found "${startChar}"`);
      }
      i++;
      while (i < xmlData.length && xmlData[i] !== startChar) {
        identifierVal += xmlData[i];
        i++;
      }
      if (xmlData[i] !== startChar) {
        throw new Error(`Unterminated ${type} value`);
      }
      i++;
      return [i, identifierVal];
    }
    readElementExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let elementName = "";
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        elementName += xmlData[i];
        i++;
      }
      if (!this.suppressValidationErr && !util.isName(elementName)) {
        throw new Error(`Invalid element name: "${elementName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let contentModel = "";
      if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) {
        i += 4;
      } else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) {
        i += 2;
      } else if (xmlData[i] === "(") {
        i++;
        while (i < xmlData.length && xmlData[i] !== ")") {
          contentModel += xmlData[i];
          i++;
        }
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated content model");
        }
      } else if (!this.suppressValidationErr) {
        throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
      }
      return {
        elementName,
        contentModel: contentModel.trim(),
        index: i
      };
    }
    readAttlistExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let elementName = "";
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        elementName += xmlData[i];
        i++;
      }
      validateEntityName(elementName);
      i = skipWhitespace(xmlData, i);
      let attributeName = "";
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        attributeName += xmlData[i];
        i++;
      }
      if (!validateEntityName(attributeName)) {
        throw new Error(`Invalid attribute name: "${attributeName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let attributeType = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
        attributeType = "NOTATION";
        i += 8;
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] !== "(") {
          throw new Error(`Expected '(', found "${xmlData[i]}"`);
        }
        i++;
        let allowedNotations = [];
        while (i < xmlData.length && xmlData[i] !== ")") {
          let notation = "";
          while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
            notation += xmlData[i];
            i++;
          }
          notation = notation.trim();
          if (!validateEntityName(notation)) {
            throw new Error(`Invalid notation name: "${notation}"`);
          }
          allowedNotations.push(notation);
          if (xmlData[i] === "|") {
            i++;
            i = skipWhitespace(xmlData, i);
          }
        }
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated list of notations");
        }
        i++;
        attributeType += " (" + allowedNotations.join("|") + ")";
      } else {
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          attributeType += xmlData[i];
          i++;
        }
        const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
        if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
          throw new Error(`Invalid attribute type: "${attributeType}"`);
        }
      }
      i = skipWhitespace(xmlData, i);
      let defaultValue = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
        defaultValue = "#REQUIRED";
        i += 8;
      } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
        defaultValue = "#IMPLIED";
        i += 7;
      } else {
        [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
      }
      return {
        elementName,
        attributeName,
        attributeType,
        defaultValue,
        index: i
      };
    }
  }
  var skipWhitespace = (data, index) => {
    while (index < data.length && /\s/.test(data[index])) {
      index++;
    }
    return index;
  };
  function hasSeq(data, seq, i) {
    for (let j = 0;j < seq.length; j++) {
      if (seq[j] !== data[i + j + 1])
        return false;
    }
    return true;
  }
  function validateEntityName(name) {
    if (util.isName(name))
      return name;
    else
      throw new Error(`Invalid entity name ${name}`);
  }
  module.exports = DocTypeReader;
});

// node_modules/strnum/strnum.js
var require_strnum = __commonJS((exports, module) => {
  var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
  var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
  var consider = {
    hex: true,
    leadingZeros: true,
    decimalPoint: ".",
    eNotation: true
  };
  function toNumber(str2, options = {}) {
    options = Object.assign({}, consider, options);
    if (!str2 || typeof str2 !== "string")
      return str2;
    let trimmedStr = str2.trim();
    if (options.skipLike !== undefined && options.skipLike.test(trimmedStr))
      return str2;
    else if (str2 === "0")
      return 0;
    else if (options.hex && hexRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 16);
    } else if (trimmedStr.search(/[eE]/) !== -1) {
      const notation = trimmedStr.match(/^([-\+])?(0*)([0-9]*(\.[0-9]*)?[eE][-\+]?[0-9]+)$/);
      if (notation) {
        if (options.leadingZeros) {
          trimmedStr = (notation[1] || "") + notation[3];
        } else {
          if (notation[2] === "0" && notation[3][0] === ".") {} else {
            return str2;
          }
        }
        return options.eNotation ? Number(trimmedStr) : str2;
      } else {
        return str2;
      }
    } else {
      const match = numRegex.exec(trimmedStr);
      if (match) {
        const sign = match[1];
        const leadingZeros = match[2];
        let numTrimmedByZeros = trimZeros(match[3]);
        if (!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".")
          return str2;
        else if (!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".")
          return str2;
        else if (options.leadingZeros && leadingZeros === str2)
          return 0;
        else {
          const num = Number(trimmedStr);
          const numStr = "" + num;
          if (numStr.search(/[eE]/) !== -1) {
            if (options.eNotation)
              return num;
            else
              return str2;
          } else if (trimmedStr.indexOf(".") !== -1) {
            if (numStr === "0" && numTrimmedByZeros === "")
              return num;
            else if (numStr === numTrimmedByZeros)
              return num;
            else if (sign && numStr === "-" + numTrimmedByZeros)
              return num;
            else
              return str2;
          }
          if (leadingZeros) {
            return numTrimmedByZeros === numStr || sign + numTrimmedByZeros === numStr ? num : str2;
          } else {
            return trimmedStr === numStr || trimmedStr === sign + numStr ? num : str2;
          }
        }
      } else {
        return str2;
      }
    }
  }
  function trimZeros(numStr) {
    if (numStr && numStr.indexOf(".") !== -1) {
      numStr = numStr.replace(/0+$/, "");
      if (numStr === ".")
        numStr = "0";
      else if (numStr[0] === ".")
        numStr = "0" + numStr;
      else if (numStr[numStr.length - 1] === ".")
        numStr = numStr.substr(0, numStr.length - 1);
      return numStr;
    }
    return numStr;
  }
  function parse_int(numStr, base) {
    if (parseInt)
      return parseInt(numStr, base);
    else if (Number.parseInt)
      return Number.parseInt(numStr, base);
    else if (window && window.parseInt)
      return window.parseInt(numStr, base);
    else
      throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
  }
  module.exports = toNumber;
});

// node_modules/fast-xml-parser/src/ignoreAttributes.js
var require_ignoreAttributes = __commonJS((exports, module) => {
  function getIgnoreAttributesFn(ignoreAttributes) {
    if (typeof ignoreAttributes === "function") {
      return ignoreAttributes;
    }
    if (Array.isArray(ignoreAttributes)) {
      return (attrName) => {
        for (const pattern of ignoreAttributes) {
          if (typeof pattern === "string" && attrName === pattern) {
            return true;
          }
          if (pattern instanceof RegExp && pattern.test(attrName)) {
            return true;
          }
        }
      };
    }
    return () => false;
  }
  module.exports = getIgnoreAttributesFn;
});

// node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
var require_OrderedObjParser = __commonJS((exports, module) => {
  var util = require_util();
  var xmlNode = require_xmlNode();
  var DocTypeReader = require_DocTypeReader();
  var toNumber = require_strnum();
  var getIgnoreAttributesFn = require_ignoreAttributes();

  class OrderedObjParser {
    constructor(options) {
      this.options = options;
      this.currentNode = null;
      this.tagsNodeStack = [];
      this.docTypeEntities = {};
      this.lastEntities = {
        apos: { regex: /&(apos|#39|#x27);/g, val: "'" },
        gt: { regex: /&(gt|#62|#x3E);/g, val: ">" },
        lt: { regex: /&(lt|#60|#x3C);/g, val: "<" },
        quot: { regex: /&(quot|#34|#x22);/g, val: '"' }
      };
      this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
      this.htmlEntities = {
        space: { regex: /&(nbsp|#160);/g, val: " " },
        cent: { regex: /&(cent|#162);/g, val: "¢" },
        pound: { regex: /&(pound|#163);/g, val: "£" },
        yen: { regex: /&(yen|#165);/g, val: "¥" },
        euro: { regex: /&(euro|#8364);/g, val: "€" },
        copyright: { regex: /&(copy|#169);/g, val: "©" },
        reg: { regex: /&(reg|#174);/g, val: "®" },
        inr: { regex: /&(inr|#8377);/g, val: "₹" },
        num_dec: { regex: /&#([0-9]{1,7});/g, val: (_, str2) => fromCodePoint(str2, 10, "&#") },
        num_hex: { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str2) => fromCodePoint(str2, 16, "&#x") }
      };
      this.addExternalEntities = addExternalEntities;
      this.parseXml = parseXml;
      this.parseTextData = parseTextData;
      this.resolveNameSpace = resolveNameSpace;
      this.buildAttributesMap = buildAttributesMap;
      this.isItStopNode = isItStopNode;
      this.replaceEntitiesValue = replaceEntitiesValue;
      this.readStopNodeData = readStopNodeData;
      this.saveTextToParentTag = saveTextToParentTag;
      this.addChild = addChild;
      this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      if (this.options.stopNodes && this.options.stopNodes.length > 0) {
        this.stopNodesExact = new Set;
        this.stopNodesWildcard = new Set;
        for (let i = 0;i < this.options.stopNodes.length; i++) {
          const stopNodeExp = this.options.stopNodes[i];
          if (typeof stopNodeExp !== "string")
            continue;
          if (stopNodeExp.startsWith("*.")) {
            this.stopNodesWildcard.add(stopNodeExp.substring(2));
          } else {
            this.stopNodesExact.add(stopNodeExp);
          }
        }
      }
    }
  }
  function addExternalEntities(externalEntities) {
    const entKeys = Object.keys(externalEntities);
    for (let i = 0;i < entKeys.length; i++) {
      const ent = entKeys[i];
      const escaped = ent.replace(/[.\-+*:]/g, "\\.");
      this.lastEntities[ent] = {
        regex: new RegExp("&" + escaped + ";", "g"),
        val: externalEntities[ent]
      };
    }
  }
  function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
    if (val !== undefined) {
      if (this.options.trimValues && !dontTrim) {
        val = val.trim();
      }
      if (val.length > 0) {
        if (!escapeEntities)
          val = this.replaceEntitiesValue(val, tagName, jPath);
        const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
        if (newval === null || newval === undefined) {
          return val;
        } else if (typeof newval !== typeof val || newval !== val) {
          return newval;
        } else if (this.options.trimValues) {
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          const trimmedVal = val.trim();
          if (trimmedVal === val) {
            return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
          } else {
            return val;
          }
        }
      }
    }
  }
  function resolveNameSpace(tagname) {
    if (this.options.removeNSPrefix) {
      const tags = tagname.split(":");
      const prefix = tagname.charAt(0) === "/" ? "/" : "";
      if (tags[0] === "xmlns") {
        return "";
      }
      if (tags.length === 2) {
        tagname = prefix + tags[1];
      }
    }
    return tagname;
  }
  var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
  function buildAttributesMap(attrStr, jPath, tagName) {
    if (this.options.ignoreAttributes !== true && typeof attrStr === "string") {
      const matches = util.getAllMatches(attrStr, attrsRegx);
      const len = matches.length;
      const attrs = {};
      for (let i = 0;i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        if (this.ignoreAttributesFn(attrName, jPath)) {
          continue;
        }
        let oldVal = matches[i][4];
        let aName = this.options.attributeNamePrefix + attrName;
        if (attrName.length) {
          if (this.options.transformAttributeName) {
            aName = this.options.transformAttributeName(aName);
          }
          aName = sanitizeName(aName, this.options);
          if (oldVal !== undefined) {
            if (this.options.trimValues) {
              oldVal = oldVal.trim();
            }
            oldVal = this.replaceEntitiesValue(oldVal, tagName, jPath);
            const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
            if (newVal === null || newVal === undefined) {
              attrs[aName] = oldVal;
            } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
              attrs[aName] = newVal;
            } else {
              attrs[aName] = parseValue(oldVal, this.options.parseAttributeValue, this.options.numberParseOptions);
            }
          } else if (this.options.allowBooleanAttributes) {
            attrs[aName] = true;
          }
        }
      }
      if (!Object.keys(attrs).length) {
        return;
      }
      if (this.options.attributesGroupName) {
        const attrCollection = {};
        attrCollection[this.options.attributesGroupName] = attrs;
        return attrCollection;
      }
      return attrs;
    }
  }
  var parseXml = function(xmlData) {
    xmlData = xmlData.replace(/\r\n?/g, `
`);
    const xmlObj = new xmlNode("!xml");
    let currentNode = xmlObj;
    let textData = "";
    let jPath = "";
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    const docTypeReader = new DocTypeReader(this.options.processEntities);
    for (let i = 0;i < xmlData.length; i++) {
      const ch = xmlData[i];
      if (ch === "<") {
        if (xmlData[i + 1] === "/") {
          const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
          let tagName = xmlData.substring(i + 2, closeIndex).trim();
          if (this.options.removeNSPrefix) {
            const colonIndex = tagName.indexOf(":");
            if (colonIndex !== -1) {
              tagName = tagName.substr(colonIndex + 1);
            }
          }
          if (this.options.transformTagName) {
            tagName = this.options.transformTagName(tagName);
          }
          if (currentNode) {
            textData = this.saveTextToParentTag(textData, currentNode, jPath);
          }
          const lastTagName = jPath.substring(jPath.lastIndexOf(".") + 1);
          if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
            throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
          }
          let propIndex = 0;
          if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
            propIndex = jPath.lastIndexOf(".", jPath.lastIndexOf(".") - 1);
            this.tagsNodeStack.pop();
          } else {
            propIndex = jPath.lastIndexOf(".");
          }
          jPath = jPath.substring(0, propIndex);
          currentNode = this.tagsNodeStack.pop();
          textData = "";
          i = closeIndex;
        } else if (xmlData[i + 1] === "?") {
          let tagData = readTagExp(xmlData, i, false, "?>");
          if (!tagData)
            throw new Error("Pi Tag is not closed.");
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
          if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) {} else {
            const childNode = new xmlNode(tagData.tagName);
            childNode.add(this.options.textNodeName, "");
            if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
            }
            this.addChild(currentNode, childNode, jPath, i);
          }
          i = tagData.closeIndex + 1;
        } else if (xmlData.substr(i + 1, 3) === "!--") {
          const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
          if (this.options.commentPropName) {
            const comment = xmlData.substring(i + 4, endIndex - 2);
            textData = this.saveTextToParentTag(textData, currentNode, jPath);
            currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
          }
          i = endIndex;
        } else if (xmlData.substr(i + 1, 2) === "!D") {
          const result = docTypeReader.readDocType(xmlData, i);
          this.docTypeEntities = result.entities;
          i = result.i;
        } else if (xmlData.substr(i + 1, 2) === "![") {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
          const tagExp = xmlData.substring(i + 9, closeIndex);
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
          let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true, true);
          if (val == undefined)
            val = "";
          if (this.options.cdataPropName) {
            currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
          } else {
            currentNode.add(this.options.textNodeName, val);
          }
          i = closeIndex + 2;
        } else {
          let result = readTagExp(xmlData, i, this.options.removeNSPrefix);
          let tagName = result.tagName;
          const rawTagName = result.rawTagName;
          let tagExp = result.tagExp;
          let attrExpPresent = result.attrExpPresent;
          let closeIndex = result.closeIndex;
          if (this.options.transformTagName) {
            const newTagName = this.options.transformTagName(tagName);
            if (tagExp === tagName) {
              tagExp = newTagName;
            }
            tagName = newTagName;
          }
          if (this.options.strictReservedNames && (tagName === this.options.commentPropName || tagName === this.options.cdataPropName || tagName === this.options.textNodeName || tagName === this.options.attributesGroupName)) {
            throw new Error(`Invalid tag name: ${tagName}`);
          }
          if (currentNode && textData) {
            if (currentNode.tagname !== "!xml") {
              textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
            }
          }
          const lastTag = currentNode;
          if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
            currentNode = this.tagsNodeStack.pop();
            jPath = jPath.substring(0, jPath.lastIndexOf("."));
          }
          if (tagName !== xmlObj.tagname) {
            jPath += jPath ? "." + tagName : tagName;
          }
          const startIndex = i;
          if (this.isItStopNode(this.stopNodesExact, this.stopNodesWildcard, jPath, tagName)) {
            let tagContent = "";
            if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
              if (tagName[tagName.length - 1] === "/") {
                tagName = tagName.substr(0, tagName.length - 1);
                jPath = jPath.substr(0, jPath.length - 1);
                tagExp = tagName;
              } else {
                tagExp = tagExp.substr(0, tagExp.length - 1);
              }
              i = result.closeIndex;
            } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
              i = result.closeIndex;
            } else {
              const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
              if (!result2)
                throw new Error(`Unexpected end of ${rawTagName}`);
              i = result2.i;
              tagContent = result2.tagContent;
            }
            const childNode = new xmlNode(tagName);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            if (tagContent) {
              tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
            }
            jPath = jPath.substr(0, jPath.lastIndexOf("."));
            childNode.add(this.options.textNodeName, tagContent);
            this.addChild(currentNode, childNode, jPath, startIndex);
          } else {
            if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
              if (tagName[tagName.length - 1] === "/") {
                tagName = tagName.substr(0, tagName.length - 1);
                jPath = jPath.substr(0, jPath.length - 1);
                tagExp = tagName;
              } else {
                tagExp = tagExp.substr(0, tagExp.length - 1);
              }
              if (this.options.transformTagName) {
                const newTagName = this.options.transformTagName(tagName);
                if (tagExp === tagName) {
                  tagExp = newTagName;
                }
                tagName = newTagName;
              }
              const childNode = new xmlNode(tagName);
              if (tagName !== tagExp && attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
              }
              this.addChild(currentNode, childNode, jPath, startIndex);
              jPath = jPath.substr(0, jPath.lastIndexOf("."));
            } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
              const childNode = new xmlNode(tagName);
              if (tagName !== tagExp && attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagExp, jPath);
              }
              this.addChild(currentNode, childNode, jPath, startIndex);
              jPath = jPath.substr(0, jPath.lastIndexOf("."));
              i = result.closeIndex;
              continue;
            } else {
              const childNode = new xmlNode(tagName);
              if (this.tagsNodeStack.length > this.options.maxNestedTags) {
                throw new Error("Maximum nested tags exceeded");
              }
              this.tagsNodeStack.push(currentNode);
              if (tagName !== tagExp && attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
              }
              this.addChild(currentNode, childNode, jPath);
              currentNode = childNode;
            }
            textData = "";
            i = closeIndex;
          }
        }
      } else {
        textData += xmlData[i];
      }
    }
    return xmlObj.child;
  };
  function addChild(currentNode, childNode, jPath, startIndex) {
    if (!this.options.captureMetaData)
      startIndex = undefined;
    const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
    if (result === false) {} else if (typeof result === "string") {
      childNode.tagname = result;
      currentNode.addChild(childNode, startIndex);
    } else {
      currentNode.addChild(childNode, startIndex);
    }
  }
  var replaceEntitiesValue = function(val, tagName, jPath) {
    if (val.indexOf("&") === -1) {
      return val;
    }
    const entityConfig = this.options.processEntities;
    if (!entityConfig.enabled) {
      return val;
    }
    if (entityConfig.allowedTags) {
      if (!entityConfig.allowedTags.includes(tagName)) {
        return val;
      }
    }
    if (entityConfig.tagFilter) {
      if (!entityConfig.tagFilter(tagName, jPath)) {
        return val;
      }
    }
    for (let entityName in this.docTypeEntities) {
      const entity = this.docTypeEntities[entityName];
      const matches = val.match(entity.regx);
      if (matches) {
        this.entityExpansionCount += matches.length;
        if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
          throw new Error(`Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`);
        }
        const lengthBefore = val.length;
        val = val.replace(entity.regx, entity.val);
        if (entityConfig.maxExpandedLength) {
          this.currentExpandedLength += val.length - lengthBefore;
          if (this.currentExpandedLength > entityConfig.maxExpandedLength) {
            throw new Error(`Total expanded content size exceeded: ${this.currentExpandedLength} > ${entityConfig.maxExpandedLength}`);
          }
        }
      }
    }
    if (val.indexOf("&") === -1)
      return val;
    for (const entityName of Object.keys(this.lastEntities)) {
      const entity = this.lastEntities[entityName];
      const matches = val.match(entity.regex);
      if (matches) {
        this.entityExpansionCount += matches.length;
        if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
          throw new Error(`Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`);
        }
      }
      val = val.replace(entity.regex, entity.val);
    }
    if (val.indexOf("&") === -1)
      return val;
    if (this.options.htmlEntities) {
      for (const entityName of Object.keys(this.htmlEntities)) {
        const entity = this.htmlEntities[entityName];
        const matches = val.match(entity.regex);
        if (matches) {
          this.entityExpansionCount += matches.length;
          if (entityConfig.maxTotalExpansions && this.entityExpansionCount > entityConfig.maxTotalExpansions) {
            throw new Error(`Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`);
          }
        }
        val = val.replace(entity.regex, entity.val);
      }
    }
    val = val.replace(this.ampEntity.regex, this.ampEntity.val);
    return val;
  };
  function saveTextToParentTag(textData, parentNode, jPath, isLeafNode) {
    if (textData) {
      if (isLeafNode === undefined)
        isLeafNode = parentNode.child.length === 0;
      textData = this.parseTextData(textData, parentNode.tagname, jPath, false, parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false, isLeafNode);
      if (textData !== undefined && textData !== "")
        parentNode.add(this.options.textNodeName, textData);
      textData = "";
    }
    return textData;
  }
  function isItStopNode(stopNodesExact, stopNodesWildcard, jPath, currentTagName) {
    if (stopNodesWildcard && stopNodesWildcard.has(currentTagName))
      return true;
    if (stopNodesExact && stopNodesExact.has(jPath))
      return true;
    return false;
  }
  function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
    let attrBoundary;
    let tagExp = "";
    for (let index = i;index < xmlData.length; index++) {
      let ch = xmlData[index];
      if (attrBoundary) {
        if (ch === attrBoundary)
          attrBoundary = "";
      } else if (ch === '"' || ch === "'") {
        attrBoundary = ch;
      } else if (ch === closingChar[0]) {
        if (closingChar[1]) {
          if (xmlData[index + 1] === closingChar[1]) {
            return {
              data: tagExp,
              index
            };
          }
        } else {
          return {
            data: tagExp,
            index
          };
        }
      } else if (ch === "\t") {
        ch = " ";
      }
      tagExp += ch;
    }
  }
  function findClosingIndex(xmlData, str2, i, errMsg) {
    const closingIndex = xmlData.indexOf(str2, i);
    if (closingIndex === -1) {
      throw new Error(errMsg);
    } else {
      return closingIndex + str2.length - 1;
    }
  }
  function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
    const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
    if (!result)
      return;
    let tagExp = result.data;
    const closeIndex = result.index;
    const separatorIndex = tagExp.search(/\s/);
    let tagName = tagExp;
    let attrExpPresent = true;
    if (separatorIndex !== -1) {
      tagName = tagExp.substring(0, separatorIndex);
      tagExp = tagExp.substring(separatorIndex + 1).trimStart();
    }
    const rawTagName = tagName;
    if (removeNSPrefix) {
      const colonIndex = tagName.indexOf(":");
      if (colonIndex !== -1) {
        tagName = tagName.substr(colonIndex + 1);
        attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
      }
    }
    return {
      tagName,
      tagExp,
      closeIndex,
      attrExpPresent,
      rawTagName
    };
  }
  function readStopNodeData(xmlData, tagName, i) {
    const startIndex = i;
    let openTagCount = 1;
    for (;i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        if (xmlData[i + 1] === "/") {
          const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
          let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
          if (closeTagName === tagName) {
            openTagCount--;
            if (openTagCount === 0) {
              return {
                tagContent: xmlData.substring(startIndex, i),
                i: closeIndex
              };
            }
          }
          i = closeIndex;
        } else if (xmlData[i + 1] === "?") {
          const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
          i = closeIndex;
        } else if (xmlData.substr(i + 1, 3) === "!--") {
          const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
          i = closeIndex;
        } else if (xmlData.substr(i + 1, 2) === "![") {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
          i = closeIndex;
        } else {
          const tagData = readTagExp(xmlData, i, ">");
          if (tagData) {
            const openTagName = tagData && tagData.tagName;
            if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
              openTagCount++;
            }
            i = tagData.closeIndex;
          }
        }
      }
    }
  }
  function parseValue(val, shouldParse, options) {
    if (shouldParse && typeof val === "string") {
      const newval = val.trim();
      if (newval === "true")
        return true;
      else if (newval === "false")
        return false;
      else
        return toNumber(val, options);
    } else {
      if (util.isExist(val)) {
        return val;
      } else {
        return "";
      }
    }
  }
  function fromCodePoint(str2, base, prefix) {
    const codePoint = Number.parseInt(str2, base);
    if (codePoint >= 0 && codePoint <= 1114111) {
      return String.fromCodePoint(codePoint);
    } else {
      return prefix + str2 + ";";
    }
  }
  function sanitizeName(name, options) {
    if (util.criticalProperties.includes(name)) {
      throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
    } else if (util.DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return options.onDangerousProperty(name);
    }
    return name;
  }
  module.exports = OrderedObjParser;
});

// node_modules/fast-xml-parser/src/xmlparser/node2json.js
var require_node2json = __commonJS((exports) => {
  function prettify(node, options) {
    return compress(node, options);
  }
  function compress(arr2, options, jPath) {
    let text;
    const compressedObj = {};
    for (let i = 0;i < arr2.length; i++) {
      const tagObj = arr2[i];
      const property = propName(tagObj);
      let newJpath = "";
      if (jPath === undefined)
        newJpath = property;
      else
        newJpath = jPath + "." + property;
      if (property === options.textNodeName) {
        if (text === undefined)
          text = tagObj[property];
        else
          text += "" + tagObj[property];
      } else if (property === undefined) {
        continue;
      } else if (tagObj[property]) {
        let val = compress(tagObj[property], options, newJpath);
        const isLeaf = isLeafTag(val, options);
        if (tagObj[":@"]) {
          assignAttributes(val, tagObj[":@"], newJpath, options);
        } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== undefined && !options.alwaysCreateTextNode) {
          val = val[options.textNodeName];
        } else if (Object.keys(val).length === 0) {
          if (options.alwaysCreateTextNode)
            val[options.textNodeName] = "";
          else
            val = "";
        }
        if (compressedObj[property] !== undefined && compressedObj.hasOwnProperty(property)) {
          if (!Array.isArray(compressedObj[property])) {
            compressedObj[property] = [compressedObj[property]];
          }
          compressedObj[property].push(val);
        } else {
          if (options.isArray(property, newJpath, isLeaf)) {
            compressedObj[property] = [val];
          } else {
            compressedObj[property] = val;
          }
        }
      }
    }
    if (typeof text === "string") {
      if (text.length > 0)
        compressedObj[options.textNodeName] = text;
    } else if (text !== undefined)
      compressedObj[options.textNodeName] = text;
    return compressedObj;
  }
  function propName(obj) {
    const keys = Object.keys(obj);
    for (let i = 0;i < keys.length; i++) {
      const key = keys[i];
      if (key !== ":@")
        return key;
    }
  }
  function assignAttributes(obj, attrMap, jpath, options) {
    if (attrMap) {
      const keys = Object.keys(attrMap);
      const len = keys.length;
      for (let i = 0;i < len; i++) {
        const atrrName = keys[i];
        if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
          obj[atrrName] = [attrMap[atrrName]];
        } else {
          obj[atrrName] = attrMap[atrrName];
        }
      }
    }
  }
  function isLeafTag(obj, options) {
    const { textNodeName } = options;
    const propCount = Object.keys(obj).length;
    if (propCount === 0) {
      return true;
    }
    if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
      return true;
    }
    return false;
  }
  exports.prettify = prettify;
});

// node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var require_XMLParser = __commonJS((exports, module) => {
  var { buildOptions } = require_OptionsBuilder();
  var OrderedObjParser = require_OrderedObjParser();
  var { prettify } = require_node2json();
  var validator = require_validator();

  class XMLParser {
    constructor(options) {
      this.externalEntities = {};
      this.options = buildOptions(options);
    }
    parse(xmlData, validationOption) {
      if (typeof xmlData === "string") {} else if (xmlData.toString) {
        xmlData = xmlData.toString();
      } else {
        throw new Error("XML data is accepted in String or Bytes[] form.");
      }
      if (validationOption) {
        if (validationOption === true)
          validationOption = {};
        const result = validator.validate(xmlData, validationOption);
        if (result !== true) {
          throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
        }
      }
      const orderedObjParser = new OrderedObjParser(this.options);
      orderedObjParser.addExternalEntities(this.externalEntities);
      const orderedResult = orderedObjParser.parseXml(xmlData);
      if (this.options.preserveOrder || orderedResult === undefined)
        return orderedResult;
      else
        return prettify(orderedResult, this.options);
    }
    addEntity(key, value) {
      if (value.indexOf("&") !== -1) {
        throw new Error("Entity value can't have '&'");
      } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
        throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
      } else if (value === "&") {
        throw new Error("An entity with value '&' is not permitted");
      } else {
        this.externalEntities[key] = value;
      }
    }
  }
  module.exports = XMLParser;
});

// node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js
var require_orderedJs2Xml = __commonJS((exports, module) => {
  var EOL = `
`;
  function toXml(jArray, options) {
    let indentation = "";
    if (options.format && options.indentBy.length > 0) {
      indentation = EOL;
    }
    return arrToStr(jArray, options, "", indentation);
  }
  function arrToStr(arr2, options, jPath, indentation) {
    let xmlStr = "";
    let isPreviousElementTag = false;
    if (!Array.isArray(arr2)) {
      if (arr2 !== undefined && arr2 !== null) {
        let text = arr2.toString();
        text = replaceEntitiesValue(text, options);
        return text;
      }
      return "";
    }
    for (let i = 0;i < arr2.length; i++) {
      const tagObj = arr2[i];
      const tagName = propName(tagObj);
      if (tagName === undefined)
        continue;
      let newJPath = "";
      if (jPath.length === 0)
        newJPath = tagName;
      else
        newJPath = `${jPath}.${tagName}`;
      if (tagName === options.textNodeName) {
        let tagText = tagObj[tagName];
        if (!isStopNode(newJPath, options)) {
          tagText = options.tagValueProcessor(tagName, tagText);
          tagText = replaceEntitiesValue(tagText, options);
        }
        if (isPreviousElementTag) {
          xmlStr += indentation;
        }
        xmlStr += tagText;
        isPreviousElementTag = false;
        continue;
      } else if (tagName === options.cdataPropName) {
        if (isPreviousElementTag) {
          xmlStr += indentation;
        }
        const cdataVal = String(tagObj[tagName][0][options.textNodeName]).replace(/\]\]>/g, "]]]]><![CDATA[>");
        xmlStr += `<![CDATA[${cdataVal}]]>`;
        isPreviousElementTag = false;
        continue;
      } else if (tagName === options.commentPropName) {
        const commentVal = String(tagObj[tagName][0][options.textNodeName]).replace(/--/g, "- -").replace(/-$/, "- ");
        xmlStr += indentation + `<!--${commentVal}-->`;
        isPreviousElementTag = true;
        continue;
      } else if (tagName[0] === "?") {
        const attStr2 = attr_to_str(tagObj[":@"], options);
        const tempInd = tagName === "?xml" ? "" : indentation;
        let piTextNodeName = tagObj[tagName][0][options.textNodeName];
        piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : "";
        xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr2}?>`;
        isPreviousElementTag = true;
        continue;
      }
      let newIdentation = indentation;
      if (newIdentation !== "") {
        newIdentation += options.indentBy;
      }
      const attStr = attr_to_str(tagObj[":@"], options);
      const tagStart = indentation + `<${tagName}${attStr}`;
      const tagValue = arrToStr(tagObj[tagName], options, newJPath, newIdentation);
      if (options.unpairedTags.indexOf(tagName) !== -1) {
        if (options.suppressUnpairedNode)
          xmlStr += tagStart + ">";
        else
          xmlStr += tagStart + "/>";
      } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
        xmlStr += tagStart + "/>";
      } else if (tagValue && tagValue.endsWith(">")) {
        xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
      } else {
        xmlStr += tagStart + ">";
        if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
          xmlStr += indentation + options.indentBy + tagValue + indentation;
        } else {
          xmlStr += tagValue;
        }
        xmlStr += `</${tagName}>`;
      }
      isPreviousElementTag = true;
    }
    return xmlStr;
  }
  function propName(obj) {
    const keys = Object.keys(obj);
    for (let i = 0;i < keys.length; i++) {
      const key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(obj, key))
        continue;
      if (key !== ":@")
        return key;
    }
  }
  function attr_to_str(attrMap, options) {
    let attrStr = "";
    if (attrMap && !options.ignoreAttributes) {
      for (let attr in attrMap) {
        if (!Object.prototype.hasOwnProperty.call(attrMap, attr))
          continue;
        let attrVal = options.attributeValueProcessor(attr, attrMap[attr]);
        attrVal = replaceEntitiesValue(attrVal, options);
        if (attrVal === true && options.suppressBooleanAttributes) {
          attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
        } else {
          attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
        }
      }
    }
    return attrStr;
  }
  function isStopNode(jPath, options) {
    jPath = jPath.substr(0, jPath.length - options.textNodeName.length - 1);
    let tagName = jPath.substr(jPath.lastIndexOf(".") + 1);
    for (let index in options.stopNodes) {
      if (options.stopNodes[index] === jPath || options.stopNodes[index] === "*." + tagName)
        return true;
    }
    return false;
  }
  function replaceEntitiesValue(textValue, options) {
    if (textValue && textValue.length > 0 && options.processEntities) {
      for (let i = 0;i < options.entities.length; i++) {
        const entity = options.entities[i];
        textValue = textValue.replace(entity.regex, entity.val);
      }
    }
    return textValue;
  }
  module.exports = toXml;
});

// node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js
var require_json2xml = __commonJS((exports, module) => {
  var buildFromOrderedJs = require_orderedJs2Xml();
  var getIgnoreAttributesFn = require_ignoreAttributes();
  var defaultOptions = {
    attributeNamePrefix: "@_",
    attributesGroupName: false,
    textNodeName: "#text",
    ignoreAttributes: true,
    cdataPropName: false,
    format: false,
    indentBy: "  ",
    suppressEmptyNode: false,
    suppressUnpairedNode: true,
    suppressBooleanAttributes: true,
    tagValueProcessor: function(key, a) {
      return a;
    },
    attributeValueProcessor: function(attrName, a) {
      return a;
    },
    preserveOrder: false,
    commentPropName: false,
    unpairedTags: [],
    entities: [
      { regex: new RegExp("&", "g"), val: "&amp;" },
      { regex: new RegExp(">", "g"), val: "&gt;" },
      { regex: new RegExp("<", "g"), val: "&lt;" },
      { regex: new RegExp("'", "g"), val: "&apos;" },
      { regex: new RegExp('"', "g"), val: "&quot;" }
    ],
    processEntities: true,
    stopNodes: [],
    oneListGroup: false
  };
  function Builder(options) {
    this.options = Object.assign({}, defaultOptions, options);
    if (this.options.ignoreAttributes === true || this.options.attributesGroupName) {
      this.isAttribute = function() {
        return false;
      };
    } else {
      this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
      this.attrPrefixLen = this.options.attributeNamePrefix.length;
      this.isAttribute = isAttribute;
    }
    this.processTextOrObjNode = processTextOrObjNode;
    if (this.options.format) {
      this.indentate = indentate;
      this.tagEndChar = `>
`;
      this.newLine = `
`;
    } else {
      this.indentate = function() {
        return "";
      };
      this.tagEndChar = ">";
      this.newLine = "";
    }
  }
  Builder.prototype.build = function(jObj) {
    if (this.options.preserveOrder) {
      return buildFromOrderedJs(jObj, this.options);
    } else {
      if (Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1) {
        jObj = {
          [this.options.arrayNodeName]: jObj
        };
      }
      return this.j2x(jObj, 0, []).val;
    }
  };
  Builder.prototype.j2x = function(jObj, level, ajPath) {
    let attrStr = "";
    let val = "";
    const jPath = ajPath.join(".");
    for (let key in jObj) {
      if (!Object.prototype.hasOwnProperty.call(jObj, key))
        continue;
      if (typeof jObj[key] === "undefined") {
        if (this.isAttribute(key)) {
          val += "";
        }
      } else if (jObj[key] === null) {
        if (this.isAttribute(key)) {
          val += "";
        } else if (key === this.options.cdataPropName) {
          val += "";
        } else if (key[0] === "?") {
          val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
        } else {
          val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
        }
      } else if (jObj[key] instanceof Date) {
        val += this.buildTextValNode(jObj[key], key, "", level);
      } else if (typeof jObj[key] !== "object") {
        const attr = this.isAttribute(key);
        if (attr && !this.ignoreAttributesFn(attr, jPath)) {
          attrStr += this.buildAttrPairStr(attr, "" + jObj[key]);
        } else if (!attr) {
          if (key === this.options.textNodeName) {
            let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
            val += this.replaceEntitiesValue(newval);
          } else {
            val += this.buildTextValNode(jObj[key], key, "", level);
          }
        }
      } else if (Array.isArray(jObj[key])) {
        const arrLen = jObj[key].length;
        let listTagVal = "";
        let listTagAttr = "";
        for (let j = 0;j < arrLen; j++) {
          const item = jObj[key][j];
          if (typeof item === "undefined") {} else if (item === null) {
            if (key[0] === "?")
              val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
            else
              val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
          } else if (typeof item === "object") {
            if (this.options.oneListGroup) {
              const result = this.j2x(item, level + 1, ajPath.concat(key));
              listTagVal += result.val;
              if (this.options.attributesGroupName && item.hasOwnProperty(this.options.attributesGroupName)) {
                listTagAttr += result.attrStr;
              }
            } else {
              listTagVal += this.processTextOrObjNode(item, key, level, ajPath);
            }
          } else {
            if (this.options.oneListGroup) {
              let textValue = this.options.tagValueProcessor(key, item);
              textValue = this.replaceEntitiesValue(textValue);
              listTagVal += textValue;
            } else {
              listTagVal += this.buildTextValNode(item, key, "", level);
            }
          }
        }
        if (this.options.oneListGroup) {
          listTagVal = this.buildObjectNode(listTagVal, key, listTagAttr, level);
        }
        val += listTagVal;
      } else {
        if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
          const Ks = Object.keys(jObj[key]);
          const L = Ks.length;
          for (let j = 0;j < L; j++) {
            attrStr += this.buildAttrPairStr(Ks[j], "" + jObj[key][Ks[j]]);
          }
        } else {
          val += this.processTextOrObjNode(jObj[key], key, level, ajPath);
        }
      }
    }
    return { attrStr, val };
  };
  Builder.prototype.buildAttrPairStr = function(attrName, val) {
    val = this.options.attributeValueProcessor(attrName, "" + val);
    val = this.replaceEntitiesValue(val);
    if (this.options.suppressBooleanAttributes && val === "true") {
      return " " + attrName;
    } else
      return " " + attrName + '="' + val + '"';
  };
  function processTextOrObjNode(object, key, level, ajPath) {
    const result = this.j2x(object, level + 1, ajPath.concat(key));
    if (object[this.options.textNodeName] !== undefined && Object.keys(object).length === 1) {
      return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
    } else {
      return this.buildObjectNode(result.val, key, result.attrStr, level);
    }
  }
  Builder.prototype.buildObjectNode = function(val, key, attrStr, level) {
    if (val === "") {
      if (key[0] === "?")
        return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
      else {
        return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
      }
    } else {
      let tagEndExp = "</" + key + this.tagEndChar;
      let piClosingChar = "";
      if (key[0] === "?") {
        piClosingChar = "?";
        tagEndExp = "";
      }
      if ((attrStr || attrStr === "") && val.indexOf("<") === -1) {
        return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val + tagEndExp;
      } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
        const safeVal = String(val).replace(/--/g, "- -").replace(/-$/, "- ");
        return this.indentate(level) + `<!--${safeVal}-->` + this.newLine;
      } else {
        return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val + this.indentate(level) + tagEndExp;
      }
    }
  };
  Builder.prototype.closeTag = function(key) {
    let closeTag = "";
    if (this.options.unpairedTags.indexOf(key) !== -1) {
      if (!this.options.suppressUnpairedNode)
        closeTag = "/";
    } else if (this.options.suppressEmptyNode) {
      closeTag = "/";
    } else {
      closeTag = `></${key}`;
    }
    return closeTag;
  };
  Builder.prototype.buildTextValNode = function(val, key, attrStr, level) {
    if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
      const safeVal = String(val).replace(/\]\]>/g, "]]]]><![CDATA[>");
      return this.indentate(level) + `<![CDATA[${safeVal}]]>` + this.newLine;
    } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
      const safeVal = String(val).replace(/--/g, "- -").replace(/-$/, "- ");
      return this.indentate(level) + `<!--${safeVal}-->` + this.newLine;
    } else if (key[0] === "?") {
      return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
    } else {
      let textValue = this.options.tagValueProcessor(key, val);
      textValue = this.replaceEntitiesValue(textValue);
      if (textValue === "") {
        return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
      } else {
        return this.indentate(level) + "<" + key + attrStr + ">" + textValue + "</" + key + this.tagEndChar;
      }
    }
  };
  Builder.prototype.replaceEntitiesValue = function(textValue) {
    if (textValue && textValue.length > 0 && this.options.processEntities) {
      for (let i = 0;i < this.options.entities.length; i++) {
        const entity = this.options.entities[i];
        textValue = textValue.replace(entity.regex, entity.val);
      }
    }
    return textValue;
  };
  function indentate(level) {
    return this.options.indentBy.repeat(level);
  }
  function isAttribute(name) {
    if (name.startsWith(this.options.attributeNamePrefix) && name !== this.options.textNodeName) {
      return name.substr(this.attrPrefixLen);
    } else {
      return false;
    }
  }
  module.exports = Builder;
});

// node_modules/fast-xml-parser/src/fxp.js
var require_fxp = __commonJS((exports, module) => {
  var validator = require_validator();
  var XMLParser = require_XMLParser();
  var XMLBuilder = require_json2xml();
  module.exports = {
    XMLParser,
    XMLValidator: validator,
    XMLBuilder
  };
});

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS((exports) => {
  var ALIAS = Symbol.for("yaml.alias");
  var DOC = Symbol.for("yaml.document");
  var MAP2 = Symbol.for("yaml.map");
  var PAIR = Symbol.for("yaml.pair");
  var SCALAR = Symbol.for("yaml.scalar");
  var SEQ = Symbol.for("yaml.seq");
  var NODE_TYPE = Symbol.for("yaml.node.type");
  var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
  var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
  var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP2;
  var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
  var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
  var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
  function isCollection(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case MAP2:
        case SEQ:
          return true;
      }
    return false;
  }
  function isNode(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case ALIAS:
        case MAP2:
        case SCALAR:
        case SEQ:
          return true;
      }
    return false;
  }
  var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
  exports.ALIAS = ALIAS;
  exports.DOC = DOC;
  exports.MAP = MAP2;
  exports.NODE_TYPE = NODE_TYPE;
  exports.PAIR = PAIR;
  exports.SCALAR = SCALAR;
  exports.SEQ = SEQ;
  exports.hasAnchor = hasAnchor;
  exports.isAlias = isAlias;
  exports.isCollection = isCollection;
  exports.isDocument = isDocument;
  exports.isMap = isMap;
  exports.isNode = isNode;
  exports.isPair = isPair;
  exports.isScalar = isScalar;
  exports.isSeq = isSeq;
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS((exports) => {
  var identity = require_identity();
  var BREAK = Symbol("break visit");
  var SKIP2 = Symbol("skip children");
  var REMOVE = Symbol("remove node");
  function visit(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
      const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      visit_(null, node, visitor_, Object.freeze([]));
  }
  visit.BREAK = BREAK;
  visit.SKIP = SKIP2;
  visit.REMOVE = REMOVE;
  function visit_(key, node, visitor, path13) {
    const ctrl = callVisitor(key, node, visitor, path13);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
      replaceNode(key, path13, ctrl);
      return visit_(key, ctrl, visitor, path13);
    }
    if (typeof ctrl !== "symbol") {
      if (identity.isCollection(node)) {
        path13 = Object.freeze(path13.concat(node));
        for (let i = 0;i < node.items.length; ++i) {
          const ci = visit_(i, node.items[i], visitor, path13);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity.isPair(node)) {
        path13 = Object.freeze(path13.concat(node));
        const ck = visit_("key", node.key, visitor, path13);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = visit_("value", node.value, visitor, path13);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  async function visitAsync(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
      const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      await visitAsync_(null, node, visitor_, Object.freeze([]));
  }
  visitAsync.BREAK = BREAK;
  visitAsync.SKIP = SKIP2;
  visitAsync.REMOVE = REMOVE;
  async function visitAsync_(key, node, visitor, path13) {
    const ctrl = await callVisitor(key, node, visitor, path13);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
      replaceNode(key, path13, ctrl);
      return visitAsync_(key, ctrl, visitor, path13);
    }
    if (typeof ctrl !== "symbol") {
      if (identity.isCollection(node)) {
        path13 = Object.freeze(path13.concat(node));
        for (let i = 0;i < node.items.length; ++i) {
          const ci = await visitAsync_(i, node.items[i], visitor, path13);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity.isPair(node)) {
        path13 = Object.freeze(path13.concat(node));
        const ck = await visitAsync_("key", node.key, visitor, path13);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = await visitAsync_("value", node.value, visitor, path13);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  function initVisitor(visitor) {
    if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
      return Object.assign({
        Alias: visitor.Node,
        Map: visitor.Node,
        Scalar: visitor.Node,
        Seq: visitor.Node
      }, visitor.Value && {
        Map: visitor.Value,
        Scalar: visitor.Value,
        Seq: visitor.Value
      }, visitor.Collection && {
        Map: visitor.Collection,
        Seq: visitor.Collection
      }, visitor);
    }
    return visitor;
  }
  function callVisitor(key, node, visitor, path13) {
    if (typeof visitor === "function")
      return visitor(key, node, path13);
    if (identity.isMap(node))
      return visitor.Map?.(key, node, path13);
    if (identity.isSeq(node))
      return visitor.Seq?.(key, node, path13);
    if (identity.isPair(node))
      return visitor.Pair?.(key, node, path13);
    if (identity.isScalar(node))
      return visitor.Scalar?.(key, node, path13);
    if (identity.isAlias(node))
      return visitor.Alias?.(key, node, path13);
    return;
  }
  function replaceNode(key, path13, node) {
    const parent = path13[path13.length - 1];
    if (identity.isCollection(parent)) {
      parent.items[key] = node;
    } else if (identity.isPair(parent)) {
      if (key === "key")
        parent.key = node;
      else
        parent.value = node;
    } else if (identity.isDocument(parent)) {
      parent.contents = node;
    } else {
      const pt = identity.isAlias(parent) ? "alias" : "scalar";
      throw new Error(`Cannot replace node with ${pt} parent`);
    }
  }
  exports.visit = visit;
  exports.visitAsync = visitAsync;
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS((exports) => {
  var identity = require_identity();
  var visit = require_visit();
  var escapeChars = {
    "!": "%21",
    ",": "%2C",
    "[": "%5B",
    "]": "%5D",
    "{": "%7B",
    "}": "%7D"
  };
  var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);

  class Directives {
    constructor(yaml, tags) {
      this.docStart = null;
      this.docEnd = false;
      this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
      this.tags = Object.assign({}, Directives.defaultTags, tags);
    }
    clone() {
      const copy = new Directives(this.yaml, this.tags);
      copy.docStart = this.docStart;
      return copy;
    }
    atDocument() {
      const res = new Directives(this.yaml, this.tags);
      switch (this.yaml.version) {
        case "1.1":
          this.atNextDocument = true;
          break;
        case "1.2":
          this.atNextDocument = false;
          this.yaml = {
            explicit: Directives.defaultYaml.explicit,
            version: "1.2"
          };
          this.tags = Object.assign({}, Directives.defaultTags);
          break;
      }
      return res;
    }
    add(line, onError) {
      if (this.atNextDocument) {
        this.yaml = { explicit: Directives.defaultYaml.explicit, version: "1.1" };
        this.tags = Object.assign({}, Directives.defaultTags);
        this.atNextDocument = false;
      }
      const parts = line.trim().split(/[ \t]+/);
      const name = parts.shift();
      switch (name) {
        case "%TAG": {
          if (parts.length !== 2) {
            onError(0, "%TAG directive should contain exactly two parts");
            if (parts.length < 2)
              return false;
          }
          const [handle, prefix] = parts;
          this.tags[handle] = prefix;
          return true;
        }
        case "%YAML": {
          this.yaml.explicit = true;
          if (parts.length !== 1) {
            onError(0, "%YAML directive should contain exactly one part");
            return false;
          }
          const [version] = parts;
          if (version === "1.1" || version === "1.2") {
            this.yaml.version = version;
            return true;
          } else {
            const isValid = /^\d+\.\d+$/.test(version);
            onError(6, `Unsupported YAML version ${version}`, isValid);
            return false;
          }
        }
        default:
          onError(0, `Unknown directive ${name}`, true);
          return false;
      }
    }
    tagName(source, onError) {
      if (source === "!")
        return "!";
      if (source[0] !== "!") {
        onError(`Not a valid tag: ${source}`);
        return null;
      }
      if (source[1] === "<") {
        const verbatim = source.slice(2, -1);
        if (verbatim === "!" || verbatim === "!!") {
          onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
          return null;
        }
        if (source[source.length - 1] !== ">")
          onError("Verbatim tags must end with a >");
        return verbatim;
      }
      const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
      if (!suffix)
        onError(`The ${source} tag has no suffix`);
      const prefix = this.tags[handle];
      if (prefix) {
        try {
          return prefix + decodeURIComponent(suffix);
        } catch (error) {
          onError(String(error));
          return null;
        }
      }
      if (handle === "!")
        return source;
      onError(`Could not resolve tag: ${source}`);
      return null;
    }
    tagString(tag) {
      for (const [handle, prefix] of Object.entries(this.tags)) {
        if (tag.startsWith(prefix))
          return handle + escapeTagName(tag.substring(prefix.length));
      }
      return tag[0] === "!" ? tag : `!<${tag}>`;
    }
    toString(doc) {
      const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
      const tagEntries = Object.entries(this.tags);
      let tagNames;
      if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
        const tags = {};
        visit.visit(doc.contents, (_key, node) => {
          if (identity.isNode(node) && node.tag)
            tags[node.tag] = true;
        });
        tagNames = Object.keys(tags);
      } else
        tagNames = [];
      for (const [handle, prefix] of tagEntries) {
        if (handle === "!!" && prefix === "tag:yaml.org,2002:")
          continue;
        if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
          lines.push(`%TAG ${handle} ${prefix}`);
      }
      return lines.join(`
`);
    }
  }
  Directives.defaultYaml = { explicit: false, version: "1.2" };
  Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
  exports.Directives = Directives;
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS((exports) => {
  var identity = require_identity();
  var visit = require_visit();
  function anchorIsValid(anchor) {
    if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
      const sa = JSON.stringify(anchor);
      const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
      throw new Error(msg);
    }
    return true;
  }
  function anchorNames(root) {
    const anchors = new Set;
    visit.visit(root, {
      Value(_key, node) {
        if (node.anchor)
          anchors.add(node.anchor);
      }
    });
    return anchors;
  }
  function findNewAnchor(prefix, exclude) {
    for (let i = 1;; ++i) {
      const name = `${prefix}${i}`;
      if (!exclude.has(name))
        return name;
    }
  }
  function createNodeAnchors(doc, prefix) {
    const aliasObjects = [];
    const sourceObjects = new Map;
    let prevAnchors = null;
    return {
      onAnchor: (source) => {
        aliasObjects.push(source);
        prevAnchors ?? (prevAnchors = anchorNames(doc));
        const anchor = findNewAnchor(prefix, prevAnchors);
        prevAnchors.add(anchor);
        return anchor;
      },
      setAnchors: () => {
        for (const source of aliasObjects) {
          const ref = sourceObjects.get(source);
          if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
            ref.node.anchor = ref.anchor;
          } else {
            const error = new Error("Failed to resolve repeated object (this should not happen)");
            error.source = source;
            throw error;
          }
        }
      },
      sourceObjects
    };
  }
  exports.anchorIsValid = anchorIsValid;
  exports.anchorNames = anchorNames;
  exports.createNodeAnchors = createNodeAnchors;
  exports.findNewAnchor = findNewAnchor;
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS((exports) => {
  function applyReviver(reviver, obj, key, val) {
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (let i = 0, len = val.length;i < len; ++i) {
          const v0 = val[i];
          const v1 = applyReviver(reviver, val, String(i), v0);
          if (v1 === undefined)
            delete val[i];
          else if (v1 !== v0)
            val[i] = v1;
        }
      } else if (val instanceof Map) {
        for (const k of Array.from(val.keys())) {
          const v0 = val.get(k);
          const v1 = applyReviver(reviver, val, k, v0);
          if (v1 === undefined)
            val.delete(k);
          else if (v1 !== v0)
            val.set(k, v1);
        }
      } else if (val instanceof Set) {
        for (const v0 of Array.from(val)) {
          const v1 = applyReviver(reviver, val, v0, v0);
          if (v1 === undefined)
            val.delete(v0);
          else if (v1 !== v0) {
            val.delete(v0);
            val.add(v1);
          }
        }
      } else {
        for (const [k, v0] of Object.entries(val)) {
          const v1 = applyReviver(reviver, val, k, v0);
          if (v1 === undefined)
            delete val[k];
          else if (v1 !== v0)
            val[k] = v1;
        }
      }
    }
    return reviver.call(obj, key, val);
  }
  exports.applyReviver = applyReviver;
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS((exports) => {
  var identity = require_identity();
  function toJS(value, arg, ctx) {
    if (Array.isArray(value))
      return value.map((v, i) => toJS(v, String(i), ctx));
    if (value && typeof value.toJSON === "function") {
      if (!ctx || !identity.hasAnchor(value))
        return value.toJSON(arg, ctx);
      const data = { aliasCount: 0, count: 1, res: undefined };
      ctx.anchors.set(value, data);
      ctx.onCreate = (res2) => {
        data.res = res2;
        delete ctx.onCreate;
      };
      const res = value.toJSON(arg, ctx);
      if (ctx.onCreate)
        ctx.onCreate(res);
      return res;
    }
    if (typeof value === "bigint" && !ctx?.keep)
      return Number(value);
    return value;
  }
  exports.toJS = toJS;
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS((exports) => {
  var applyReviver = require_applyReviver();
  var identity = require_identity();
  var toJS = require_toJS();

  class NodeBase {
    constructor(type) {
      Object.defineProperty(this, identity.NODE_TYPE, { value: type });
    }
    clone() {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      if (!identity.isDocument(doc))
        throw new TypeError("A document argument is required");
      const ctx = {
        anchors: new Map,
        doc,
        keep: true,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS.toJS(this, "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
    }
  }
  exports.NodeBase = NodeBase;
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS((exports) => {
  var anchors = require_anchors();
  var visit = require_visit();
  var identity = require_identity();
  var Node = require_Node();
  var toJS = require_toJS();

  class Alias extends Node.NodeBase {
    constructor(source) {
      super(identity.ALIAS);
      this.source = source;
      Object.defineProperty(this, "tag", {
        set() {
          throw new Error("Alias nodes cannot have tags");
        }
      });
    }
    resolve(doc, ctx) {
      let nodes;
      if (ctx?.aliasResolveCache) {
        nodes = ctx.aliasResolveCache;
      } else {
        nodes = [];
        visit.visit(doc, {
          Node: (_key, node) => {
            if (identity.isAlias(node) || identity.hasAnchor(node))
              nodes.push(node);
          }
        });
        if (ctx)
          ctx.aliasResolveCache = nodes;
      }
      let found = undefined;
      for (const node of nodes) {
        if (node === this)
          break;
        if (node.anchor === this.source)
          found = node;
      }
      return found;
    }
    toJSON(_arg, ctx) {
      if (!ctx)
        return { source: this.source };
      const { anchors: anchors2, doc, maxAliasCount } = ctx;
      const source = this.resolve(doc, ctx);
      if (!source) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new ReferenceError(msg);
      }
      let data = anchors2.get(source);
      if (!data) {
        toJS.toJS(source, null, ctx);
        data = anchors2.get(source);
      }
      if (!data || data.res === undefined) {
        const msg = "This should not happen: Alias anchor was not resolved?";
        throw new ReferenceError(msg);
      }
      if (maxAliasCount >= 0) {
        data.count += 1;
        if (data.aliasCount === 0)
          data.aliasCount = getAliasCount(doc, source, anchors2);
        if (data.count * data.aliasCount > maxAliasCount) {
          const msg = "Excessive alias count indicates a resource exhaustion attack";
          throw new ReferenceError(msg);
        }
      }
      return data.res;
    }
    toString(ctx, _onComment, _onChompKeep) {
      const src = `*${this.source}`;
      if (ctx) {
        anchors.anchorIsValid(this.source);
        if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new Error(msg);
        }
        if (ctx.implicitKey)
          return `${src} `;
      }
      return src;
    }
  }
  function getAliasCount(doc, node, anchors2) {
    if (identity.isAlias(node)) {
      const source = node.resolve(doc);
      const anchor = anchors2 && source && anchors2.get(source);
      return anchor ? anchor.count * anchor.aliasCount : 0;
    } else if (identity.isCollection(node)) {
      let count = 0;
      for (const item of node.items) {
        const c2 = getAliasCount(doc, item, anchors2);
        if (c2 > count)
          count = c2;
      }
      return count;
    } else if (identity.isPair(node)) {
      const kc = getAliasCount(doc, node.key, anchors2);
      const vc = getAliasCount(doc, node.value, anchors2);
      return Math.max(kc, vc);
    }
    return 1;
  }
  exports.Alias = Alias;
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS((exports) => {
  var identity = require_identity();
  var Node = require_Node();
  var toJS = require_toJS();
  var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";

  class Scalar extends Node.NodeBase {
    constructor(value) {
      super(identity.SCALAR);
      this.value = value;
    }
    toJSON(arg, ctx) {
      return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
    }
    toString() {
      return String(this.value);
    }
  }
  Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
  Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
  Scalar.PLAIN = "PLAIN";
  Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
  Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
  exports.Scalar = Scalar;
  exports.isScalarValue = isScalarValue;
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS((exports) => {
  var Alias = require_Alias();
  var identity = require_identity();
  var Scalar = require_Scalar();
  var defaultTagPrefix = "tag:yaml.org,2002:";
  function findTagObject(value, tagName, tags) {
    if (tagName) {
      const match = tags.filter((t) => t.tag === tagName);
      const tagObj = match.find((t) => !t.format) ?? match[0];
      if (!tagObj)
        throw new Error(`Tag ${tagName} not found`);
      return tagObj;
    }
    return tags.find((t) => t.identify?.(value) && !t.format);
  }
  function createNode(value, tagName, ctx) {
    if (identity.isDocument(value))
      value = value.contents;
    if (identity.isNode(value))
      return value;
    if (identity.isPair(value)) {
      const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
      map.items.push(value);
      return map;
    }
    if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
      value = value.valueOf();
    }
    const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
    let ref = undefined;
    if (aliasDuplicateObjects && value && typeof value === "object") {
      ref = sourceObjects.get(value);
      if (ref) {
        ref.anchor ?? (ref.anchor = onAnchor(value));
        return new Alias.Alias(ref.anchor);
      } else {
        ref = { anchor: null, node: null };
        sourceObjects.set(value, ref);
      }
    }
    if (tagName?.startsWith("!!"))
      tagName = defaultTagPrefix + tagName.slice(2);
    let tagObj = findTagObject(value, tagName, schema.tags);
    if (!tagObj) {
      if (value && typeof value.toJSON === "function") {
        value = value.toJSON();
      }
      if (!value || typeof value !== "object") {
        const node2 = new Scalar.Scalar(value);
        if (ref)
          ref.node = node2;
        return node2;
      }
      tagObj = value instanceof Map ? schema[identity.MAP] : (Symbol.iterator in Object(value)) ? schema[identity.SEQ] : schema[identity.MAP];
    }
    if (onTagObj) {
      onTagObj(tagObj);
      delete ctx.onTagObj;
    }
    const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
    if (tagName)
      node.tag = tagName;
    else if (!tagObj.default)
      node.tag = tagObj.tag;
    if (ref)
      ref.node = node;
    return node;
  }
  exports.createNode = createNode;
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS((exports) => {
  var createNode = require_createNode();
  var identity = require_identity();
  var Node = require_Node();
  function collectionFromPath(schema, path13, value) {
    let v = value;
    for (let i = path13.length - 1;i >= 0; --i) {
      const k = path13[i];
      if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
        const a = [];
        a[k] = v;
        v = a;
      } else {
        v = new Map([[k, v]]);
      }
    }
    return createNode.createNode(v, undefined, {
      aliasDuplicateObjects: false,
      keepUndefined: false,
      onAnchor: () => {
        throw new Error("This should not happen, please report a bug.");
      },
      schema,
      sourceObjects: new Map
    });
  }
  var isEmptyPath = (path13) => path13 == null || typeof path13 === "object" && !!path13[Symbol.iterator]().next().done;

  class Collection extends Node.NodeBase {
    constructor(type, schema) {
      super(type);
      Object.defineProperty(this, "schema", {
        value: schema,
        configurable: true,
        enumerable: false,
        writable: true
      });
    }
    clone(schema) {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (schema)
        copy.schema = schema;
      copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    addIn(path13, value) {
      if (isEmptyPath(path13))
        this.add(value);
      else {
        const [key, ...rest] = path13;
        const node = this.get(key, true);
        if (identity.isCollection(node))
          node.addIn(rest, value);
        else if (node === undefined && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
    deleteIn(path13) {
      const [key, ...rest] = path13;
      if (rest.length === 0)
        return this.delete(key);
      const node = this.get(key, true);
      if (identity.isCollection(node))
        return node.deleteIn(rest);
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
    getIn(path13, keepScalar) {
      const [key, ...rest] = path13;
      const node = this.get(key, true);
      if (rest.length === 0)
        return !keepScalar && identity.isScalar(node) ? node.value : node;
      else
        return identity.isCollection(node) ? node.getIn(rest, keepScalar) : undefined;
    }
    hasAllNullValues(allowScalar) {
      return this.items.every((node) => {
        if (!identity.isPair(node))
          return false;
        const n = node.value;
        return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
      });
    }
    hasIn(path13) {
      const [key, ...rest] = path13;
      if (rest.length === 0)
        return this.has(key);
      const node = this.get(key, true);
      return identity.isCollection(node) ? node.hasIn(rest) : false;
    }
    setIn(path13, value) {
      const [key, ...rest] = path13;
      if (rest.length === 0) {
        this.set(key, value);
      } else {
        const node = this.get(key, true);
        if (identity.isCollection(node))
          node.setIn(rest, value);
        else if (node === undefined && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
  }
  exports.Collection = Collection;
  exports.collectionFromPath = collectionFromPath;
  exports.isEmptyPath = isEmptyPath;
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS((exports) => {
  var stringifyComment = (str2) => str2.replace(/^(?!$)(?: $)?/gm, "#");
  function indentComment(comment, indent) {
    if (/^\n+$/.test(comment))
      return comment.substring(1);
    return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
  }
  var lineComment = (str2, indent, comment) => str2.endsWith(`
`) ? indentComment(comment, indent) : comment.includes(`
`) ? `
` + indentComment(comment, indent) : (str2.endsWith(" ") ? "" : " ") + comment;
  exports.indentComment = indentComment;
  exports.lineComment = lineComment;
  exports.stringifyComment = stringifyComment;
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS((exports) => {
  var FOLD_FLOW = "flow";
  var FOLD_BLOCK = "block";
  var FOLD_QUOTED = "quoted";
  function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
    if (!lineWidth || lineWidth < 0)
      return text;
    if (lineWidth < minContentWidth)
      minContentWidth = 0;
    const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
    if (text.length <= endStep)
      return text;
    const folds = [];
    const escapedFolds = {};
    let end = lineWidth - indent.length;
    if (typeof indentAtStart === "number") {
      if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
        folds.push(0);
      else
        end = lineWidth - indentAtStart;
    }
    let split = undefined;
    let prev = undefined;
    let overflow = false;
    let i = -1;
    let escStart = -1;
    let escEnd = -1;
    if (mode === FOLD_BLOCK) {
      i = consumeMoreIndentedLines(text, i, indent.length);
      if (i !== -1)
        end = i + endStep;
    }
    for (let ch;ch = text[i += 1]; ) {
      if (mode === FOLD_QUOTED && ch === "\\") {
        escStart = i;
        switch (text[i + 1]) {
          case "x":
            i += 3;
            break;
          case "u":
            i += 5;
            break;
          case "U":
            i += 9;
            break;
          default:
            i += 1;
        }
        escEnd = i;
      }
      if (ch === `
`) {
        if (mode === FOLD_BLOCK)
          i = consumeMoreIndentedLines(text, i, indent.length);
        end = i + indent.length + endStep;
        split = undefined;
      } else {
        if (ch === " " && prev && prev !== " " && prev !== `
` && prev !== "\t") {
          const next = text[i + 1];
          if (next && next !== " " && next !== `
` && next !== "\t")
            split = i;
        }
        if (i >= end) {
          if (split) {
            folds.push(split);
            end = split + endStep;
            split = undefined;
          } else if (mode === FOLD_QUOTED) {
            while (prev === " " || prev === "\t") {
              prev = ch;
              ch = text[i += 1];
              overflow = true;
            }
            const j = i > escEnd + 1 ? i - 2 : escStart - 1;
            if (escapedFolds[j])
              return text;
            folds.push(j);
            escapedFolds[j] = true;
            end = j + endStep;
            split = undefined;
          } else {
            overflow = true;
          }
        }
      }
      prev = ch;
    }
    if (overflow && onOverflow)
      onOverflow();
    if (folds.length === 0)
      return text;
    if (onFold)
      onFold();
    let res = text.slice(0, folds[0]);
    for (let i2 = 0;i2 < folds.length; ++i2) {
      const fold = folds[i2];
      const end2 = folds[i2 + 1] || text.length;
      if (fold === 0)
        res = `
${indent}${text.slice(0, end2)}`;
      else {
        if (mode === FOLD_QUOTED && escapedFolds[fold])
          res += `${text[fold]}\\`;
        res += `
${indent}${text.slice(fold + 1, end2)}`;
      }
    }
    return res;
  }
  function consumeMoreIndentedLines(text, i, indent) {
    let end = i;
    let start = i + 1;
    let ch = text[start];
    while (ch === " " || ch === "\t") {
      if (i < start + indent) {
        ch = text[++i];
      } else {
        do {
          ch = text[++i];
        } while (ch && ch !== `
`);
        end = i;
        start = i + 1;
        ch = text[start];
      }
    }
    return end;
  }
  exports.FOLD_BLOCK = FOLD_BLOCK;
  exports.FOLD_FLOW = FOLD_FLOW;
  exports.FOLD_QUOTED = FOLD_QUOTED;
  exports.foldFlowLines = foldFlowLines;
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var foldFlowLines = require_foldFlowLines();
  var getFoldOptions = (ctx, isBlock) => ({
    indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
    lineWidth: ctx.options.lineWidth,
    minContentWidth: ctx.options.minContentWidth
  });
  var containsDocumentMarker = (str2) => /^(%|---|\.\.\.)/m.test(str2);
  function lineLengthOverLimit(str2, lineWidth, indentLength) {
    if (!lineWidth || lineWidth < 0)
      return false;
    const limit = lineWidth - indentLength;
    const strLen = str2.length;
    if (strLen <= limit)
      return false;
    for (let i = 0, start = 0;i < strLen; ++i) {
      if (str2[i] === `
`) {
        if (i - start > limit)
          return true;
        start = i + 1;
        if (strLen - start <= limit)
          return false;
      }
    }
    return true;
  }
  function doubleQuotedString(value, ctx) {
    const json = JSON.stringify(value);
    if (ctx.options.doubleQuotedAsJSON)
      return json;
    const { implicitKey } = ctx;
    const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    let str2 = "";
    let start = 0;
    for (let i = 0, ch = json[i];ch; ch = json[++i]) {
      if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
        str2 += json.slice(start, i) + "\\ ";
        i += 1;
        start = i;
        ch = "\\";
      }
      if (ch === "\\")
        switch (json[i + 1]) {
          case "u":
            {
              str2 += json.slice(start, i);
              const code = json.substr(i + 2, 4);
              switch (code) {
                case "0000":
                  str2 += "\\0";
                  break;
                case "0007":
                  str2 += "\\a";
                  break;
                case "000b":
                  str2 += "\\v";
                  break;
                case "001b":
                  str2 += "\\e";
                  break;
                case "0085":
                  str2 += "\\N";
                  break;
                case "00a0":
                  str2 += "\\_";
                  break;
                case "2028":
                  str2 += "\\L";
                  break;
                case "2029":
                  str2 += "\\P";
                  break;
                default:
                  if (code.substr(0, 2) === "00")
                    str2 += "\\x" + code.substr(2);
                  else
                    str2 += json.substr(i, 6);
              }
              i += 5;
              start = i + 1;
            }
            break;
          case "n":
            if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
              i += 1;
            } else {
              str2 += json.slice(start, i) + `

`;
              while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                str2 += `
`;
                i += 2;
              }
              str2 += indent;
              if (json[i + 2] === " ")
                str2 += "\\";
              i += 1;
              start = i + 1;
            }
            break;
          default:
            i += 1;
        }
    }
    str2 = start ? str2 + json.slice(start) : json;
    return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
  }
  function singleQuotedString(value, ctx) {
    if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes(`
`) || /[ \t]\n|\n[ \t]/.test(value))
      return doubleQuotedString(value, ctx);
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
    return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function quotedString(value, ctx) {
    const { singleQuote } = ctx.options;
    let qs;
    if (singleQuote === false)
      qs = doubleQuotedString;
    else {
      const hasDouble = value.includes('"');
      const hasSingle = value.includes("'");
      if (hasDouble && !hasSingle)
        qs = singleQuotedString;
      else if (hasSingle && !hasDouble)
        qs = doubleQuotedString;
      else
        qs = singleQuote ? singleQuotedString : doubleQuotedString;
    }
    return qs(value, ctx);
  }
  var blockEndNewlines;
  try {
    blockEndNewlines = new RegExp(`(^|(?<!
))
+(?!
|$)`, "g");
  } catch {
    blockEndNewlines = /\n+(?!\n|$)/g;
  }
  function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
    const { blockQuote, commentString, lineWidth } = ctx.options;
    if (!blockQuote || /\n[\t ]+$/.test(value)) {
      return quotedString(value, ctx);
    }
    const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
    const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
    if (!value)
      return literal ? `|
` : `>
`;
    let chomp;
    let endStart;
    for (endStart = value.length;endStart > 0; --endStart) {
      const ch = value[endStart - 1];
      if (ch !== `
` && ch !== "\t" && ch !== " ")
        break;
    }
    let end = value.substring(endStart);
    const endNlPos = end.indexOf(`
`);
    if (endNlPos === -1) {
      chomp = "-";
    } else if (value === end || endNlPos !== end.length - 1) {
      chomp = "+";
      if (onChompKeep)
        onChompKeep();
    } else {
      chomp = "";
    }
    if (end) {
      value = value.slice(0, -end.length);
      if (end[end.length - 1] === `
`)
        end = end.slice(0, -1);
      end = end.replace(blockEndNewlines, `$&${indent}`);
    }
    let startWithSpace = false;
    let startEnd;
    let startNlPos = -1;
    for (startEnd = 0;startEnd < value.length; ++startEnd) {
      const ch = value[startEnd];
      if (ch === " ")
        startWithSpace = true;
      else if (ch === `
`)
        startNlPos = startEnd;
      else
        break;
    }
    let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
    if (start) {
      value = value.substring(start.length);
      start = start.replace(/\n+/g, `$&${indent}`);
    }
    const indentSize = indent ? "2" : "1";
    let header = (startWithSpace ? indentSize : "") + chomp;
    if (comment) {
      header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
      if (onComment)
        onComment();
    }
    if (!literal) {
      const foldedValue = value.replace(/\n+/g, `
$&`).replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
      let literalFallback = false;
      const foldOptions = getFoldOptions(ctx, true);
      if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
        foldOptions.onOverflow = () => {
          literalFallback = true;
        };
      }
      const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
      if (!literalFallback)
        return `>${header}
${indent}${body}`;
    }
    value = value.replace(/\n+/g, `$&${indent}`);
    return `|${header}
${indent}${start}${value}${end}`;
  }
  function plainString(item, ctx, onComment, onChompKeep) {
    const { type, value } = item;
    const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
    if (implicitKey && value.includes(`
`) || inFlow && /[[\]{},]/.test(value)) {
      return quotedString(value, ctx);
    }
    if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
      return implicitKey || inFlow || !value.includes(`
`) ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
    }
    if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes(`
`)) {
      return blockString(item, ctx, onComment, onChompKeep);
    }
    if (containsDocumentMarker(value)) {
      if (indent === "") {
        ctx.forceBlockIndent = true;
        return blockString(item, ctx, onComment, onChompKeep);
      } else if (implicitKey && indent === indentStep) {
        return quotedString(value, ctx);
      }
    }
    const str2 = value.replace(/\n+/g, `$&
${indent}`);
    if (actualString) {
      const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str2);
      const { compat, tags } = ctx.doc.schema;
      if (tags.some(test) || compat?.some(test))
        return quotedString(value, ctx);
    }
    return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function stringifyString(item, ctx, onComment, onChompKeep) {
    const { implicitKey, inFlow } = ctx;
    const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
    let { type } = item;
    if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
      if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
        type = Scalar.Scalar.QUOTE_DOUBLE;
    }
    const _stringify = (_type) => {
      switch (_type) {
        case Scalar.Scalar.BLOCK_FOLDED:
        case Scalar.Scalar.BLOCK_LITERAL:
          return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
        case Scalar.Scalar.QUOTE_DOUBLE:
          return doubleQuotedString(ss.value, ctx);
        case Scalar.Scalar.QUOTE_SINGLE:
          return singleQuotedString(ss.value, ctx);
        case Scalar.Scalar.PLAIN:
          return plainString(ss, ctx, onComment, onChompKeep);
        default:
          return null;
      }
    };
    let res = _stringify(type);
    if (res === null) {
      const { defaultKeyType, defaultStringType } = ctx.options;
      const t = implicitKey && defaultKeyType || defaultStringType;
      res = _stringify(t);
      if (res === null)
        throw new Error(`Unsupported default string type ${t}`);
    }
    return res;
  }
  exports.stringifyString = stringifyString;
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS((exports) => {
  var anchors = require_anchors();
  var identity = require_identity();
  var stringifyComment = require_stringifyComment();
  var stringifyString = require_stringifyString();
  function createStringifyContext(doc, options) {
    const opt = Object.assign({
      blockQuote: true,
      commentString: stringifyComment.stringifyComment,
      defaultKeyType: null,
      defaultStringType: "PLAIN",
      directives: null,
      doubleQuotedAsJSON: false,
      doubleQuotedMinMultiLineLength: 40,
      falseStr: "false",
      flowCollectionPadding: true,
      indentSeq: true,
      lineWidth: 80,
      minContentWidth: 20,
      nullStr: "null",
      simpleKeys: false,
      singleQuote: null,
      trueStr: "true",
      verifyAliasOrder: true
    }, doc.schema.toStringOptions, options);
    let inFlow;
    switch (opt.collectionStyle) {
      case "block":
        inFlow = false;
        break;
      case "flow":
        inFlow = true;
        break;
      default:
        inFlow = null;
    }
    return {
      anchors: new Set,
      doc,
      flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
      indent: "",
      indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
      inFlow,
      options: opt
    };
  }
  function getTagObject(tags, item) {
    if (item.tag) {
      const match = tags.filter((t) => t.tag === item.tag);
      if (match.length > 0)
        return match.find((t) => t.format === item.format) ?? match[0];
    }
    let tagObj = undefined;
    let obj;
    if (identity.isScalar(item)) {
      obj = item.value;
      let match = tags.filter((t) => t.identify?.(obj));
      if (match.length > 1) {
        const testMatch = match.filter((t) => t.test);
        if (testMatch.length > 0)
          match = testMatch;
      }
      tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
    } else {
      obj = item;
      tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
    }
    if (!tagObj) {
      const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
      throw new Error(`Tag not resolved for ${name} value`);
    }
    return tagObj;
  }
  function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
    if (!doc.directives)
      return "";
    const props = [];
    const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
    if (anchor && anchors.anchorIsValid(anchor)) {
      anchors$1.add(anchor);
      props.push(`&${anchor}`);
    }
    const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
    if (tag)
      props.push(doc.directives.tagString(tag));
    return props.join(" ");
  }
  function stringify2(item, ctx, onComment, onChompKeep) {
    if (identity.isPair(item))
      return item.toString(ctx, onComment, onChompKeep);
    if (identity.isAlias(item)) {
      if (ctx.doc.directives)
        return item.toString(ctx);
      if (ctx.resolvedAliases?.has(item)) {
        throw new TypeError(`Cannot stringify circular structure without alias nodes`);
      } else {
        if (ctx.resolvedAliases)
          ctx.resolvedAliases.add(item);
        else
          ctx.resolvedAliases = new Set([item]);
        item = item.resolve(ctx.doc);
      }
    }
    let tagObj = undefined;
    const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
    tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
    const props = stringifyProps(node, tagObj, ctx);
    if (props.length > 0)
      ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
    const str2 = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
    if (!props)
      return str2;
    return identity.isScalar(node) || str2[0] === "{" || str2[0] === "[" ? `${props} ${str2}` : `${props}
${ctx.indent}${str2}`;
  }
  exports.createStringifyContext = createStringifyContext;
  exports.stringify = stringify2;
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var stringify2 = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
    const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
    let keyComment = identity.isNode(key) && key.comment || null;
    if (simpleKeys) {
      if (keyComment) {
        throw new Error("With simple keys, key nodes cannot have comments");
      }
      if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
        const msg = "With simple keys, collection cannot be used as a key value";
        throw new Error(msg);
      }
    }
    let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
    ctx = Object.assign({}, ctx, {
      allNullValues: false,
      implicitKey: !explicitKey && (simpleKeys || !allNullValues),
      indent: indent + indentStep
    });
    let keyCommentDone = false;
    let chompKeep = false;
    let str2 = stringify2.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
    if (!explicitKey && !ctx.inFlow && str2.length > 1024) {
      if (simpleKeys)
        throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
      explicitKey = true;
    }
    if (ctx.inFlow) {
      if (allNullValues || value == null) {
        if (keyCommentDone && onComment)
          onComment();
        return str2 === "" ? "?" : explicitKey ? `? ${str2}` : str2;
      }
    } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
      str2 = `? ${str2}`;
      if (keyComment && !keyCommentDone) {
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str2;
    }
    if (keyCommentDone)
      keyComment = null;
    if (explicitKey) {
      if (keyComment)
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
      str2 = `? ${str2}
${indent}:`;
    } else {
      str2 = `${str2}:`;
      if (keyComment)
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
    }
    let vsb, vcb, valueComment;
    if (identity.isNode(value)) {
      vsb = !!value.spaceBefore;
      vcb = value.commentBefore;
      valueComment = value.comment;
    } else {
      vsb = false;
      vcb = null;
      valueComment = null;
      if (value && typeof value === "object")
        value = doc.createNode(value);
    }
    ctx.implicitKey = false;
    if (!explicitKey && !keyComment && identity.isScalar(value))
      ctx.indentAtStart = str2.length + 1;
    chompKeep = false;
    if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
      ctx.indent = ctx.indent.substring(2);
    }
    let valueCommentDone = false;
    const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
    let ws = " ";
    if (keyComment || vsb || vcb) {
      ws = vsb ? `
` : "";
      if (vcb) {
        const cs = commentString(vcb);
        ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
      }
      if (valueStr === "" && !ctx.inFlow) {
        if (ws === `
`)
          ws = `

`;
      } else {
        ws += `
${ctx.indent}`;
      }
    } else if (!explicitKey && identity.isCollection(value)) {
      const vs0 = valueStr[0];
      const nl0 = valueStr.indexOf(`
`);
      const hasNewline = nl0 !== -1;
      const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
      if (hasNewline || !flow) {
        let hasPropsLine = false;
        if (hasNewline && (vs0 === "&" || vs0 === "!")) {
          let sp0 = valueStr.indexOf(" ");
          if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
            sp0 = valueStr.indexOf(" ", sp0 + 1);
          }
          if (sp0 === -1 || nl0 < sp0)
            hasPropsLine = true;
        }
        if (!hasPropsLine)
          ws = `
${ctx.indent}`;
      }
    } else if (valueStr === "" || valueStr[0] === `
`) {
      ws = "";
    }
    str2 += ws + valueStr;
    if (ctx.inFlow) {
      if (valueCommentDone && onComment)
        onComment();
    } else if (valueComment && !valueCommentDone) {
      str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(valueComment));
    } else if (chompKeep && onChompKeep) {
      onChompKeep();
    }
    return str2;
  }
  exports.stringifyPair = stringifyPair;
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS((exports) => {
  var node_process = __require("process");
  function debug(logLevel, ...messages) {
    if (logLevel === "debug")
      console.log(...messages);
  }
  function warn(logLevel, warning) {
    if (logLevel === "debug" || logLevel === "warn") {
      if (typeof node_process.emitWarning === "function")
        node_process.emitWarning(warning);
      else
        console.warn(warning);
    }
  }
  exports.debug = debug;
  exports.warn = warn;
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var MERGE_KEY = "<<";
  var merge = {
    identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
    default: "key",
    tag: "tag:yaml.org,2002:merge",
    test: /^<<$/,
    resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
      addToJSMap: addMergeToJSMap
    }),
    stringify: () => MERGE_KEY
  };
  var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
  function addMergeToJSMap(ctx, map, value) {
    value = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
    if (identity.isSeq(value))
      for (const it of value.items)
        mergeValue(ctx, map, it);
    else if (Array.isArray(value))
      for (const it of value)
        mergeValue(ctx, map, it);
    else
      mergeValue(ctx, map, value);
  }
  function mergeValue(ctx, map, value) {
    const source = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
    if (!identity.isMap(source))
      throw new Error("Merge sources must be maps or map aliases");
    const srcMap = source.toJSON(null, ctx, Map);
    for (const [key, value2] of srcMap) {
      if (map instanceof Map) {
        if (!map.has(key))
          map.set(key, value2);
      } else if (map instanceof Set) {
        map.add(key);
      } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
        Object.defineProperty(map, key, {
          value: value2,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
    return map;
  }
  exports.addMergeToJSMap = addMergeToJSMap;
  exports.isMergeKey = isMergeKey;
  exports.merge = merge;
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS((exports) => {
  var log = require_log();
  var merge = require_merge();
  var stringify2 = require_stringify();
  var identity = require_identity();
  var toJS = require_toJS();
  function addPairToJSMap(ctx, map, { key, value }) {
    if (identity.isNode(key) && key.addToJSMap)
      key.addToJSMap(ctx, map, value);
    else if (merge.isMergeKey(ctx, key))
      merge.addMergeToJSMap(ctx, map, value);
    else {
      const jsKey = toJS.toJS(key, "", ctx);
      if (map instanceof Map) {
        map.set(jsKey, toJS.toJS(value, jsKey, ctx));
      } else if (map instanceof Set) {
        map.add(jsKey);
      } else {
        const stringKey = stringifyKey(key, jsKey, ctx);
        const jsValue = toJS.toJS(value, stringKey, ctx);
        if (stringKey in map)
          Object.defineProperty(map, stringKey, {
            value: jsValue,
            writable: true,
            enumerable: true,
            configurable: true
          });
        else
          map[stringKey] = jsValue;
      }
    }
    return map;
  }
  function stringifyKey(key, jsKey, ctx) {
    if (jsKey === null)
      return "";
    if (typeof jsKey !== "object")
      return String(jsKey);
    if (identity.isNode(key) && ctx?.doc) {
      const strCtx = stringify2.createStringifyContext(ctx.doc, {});
      strCtx.anchors = new Set;
      for (const node of ctx.anchors.keys())
        strCtx.anchors.add(node.anchor);
      strCtx.inFlow = true;
      strCtx.inStringifyKey = true;
      const strKey = key.toString(strCtx);
      if (!ctx.mapKeyWarned) {
        let jsonStr = JSON.stringify(strKey);
        if (jsonStr.length > 40)
          jsonStr = jsonStr.substring(0, 36) + '..."';
        log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
        ctx.mapKeyWarned = true;
      }
      return strKey;
    }
    return JSON.stringify(jsKey);
  }
  exports.addPairToJSMap = addPairToJSMap;
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS((exports) => {
  var createNode = require_createNode();
  var stringifyPair = require_stringifyPair();
  var addPairToJSMap = require_addPairToJSMap();
  var identity = require_identity();
  function createPair(key, value, ctx) {
    const k = createNode.createNode(key, undefined, ctx);
    const v = createNode.createNode(value, undefined, ctx);
    return new Pair(k, v);
  }

  class Pair {
    constructor(key, value = null) {
      Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
      this.key = key;
      this.value = value;
    }
    clone(schema) {
      let { key, value } = this;
      if (identity.isNode(key))
        key = key.clone(schema);
      if (identity.isNode(value))
        value = value.clone(schema);
      return new Pair(key, value);
    }
    toJSON(_, ctx) {
      const pair = ctx?.mapAsMap ? new Map : {};
      return addPairToJSMap.addPairToJSMap(ctx, pair, this);
    }
    toString(ctx, onComment, onChompKeep) {
      return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
    }
  }
  exports.Pair = Pair;
  exports.createPair = createPair;
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS((exports) => {
  var identity = require_identity();
  var stringify2 = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyCollection(collection, ctx, options) {
    const flow = ctx.inFlow ?? collection.flow;
    const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
    return stringify3(collection, ctx, options);
  }
  function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
    const { indent, options: { commentString } } = ctx;
    const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
    let chompKeep = false;
    const lines = [];
    for (let i = 0;i < items.length; ++i) {
      const item = items[i];
      let comment2 = null;
      if (identity.isNode(item)) {
        if (!chompKeep && item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
        if (item.comment)
          comment2 = item.comment;
      } else if (identity.isPair(item)) {
        const ik = identity.isNode(item.key) ? item.key : null;
        if (ik) {
          if (!chompKeep && ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
        }
      }
      chompKeep = false;
      let str3 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
      if (comment2)
        str3 += stringifyComment.lineComment(str3, itemIndent, commentString(comment2));
      if (chompKeep && comment2)
        chompKeep = false;
      lines.push(blockItemPrefix + str3);
    }
    let str2;
    if (lines.length === 0) {
      str2 = flowChars.start + flowChars.end;
    } else {
      str2 = lines[0];
      for (let i = 1;i < lines.length; ++i) {
        const line = lines[i];
        str2 += line ? `
${indent}${line}` : `
`;
      }
    }
    if (comment) {
      str2 += `
` + stringifyComment.indentComment(commentString(comment), indent);
      if (onComment)
        onComment();
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str2;
  }
  function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
    const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
    itemIndent += indentStep;
    const itemCtx = Object.assign({}, ctx, {
      indent: itemIndent,
      inFlow: true,
      type: null
    });
    let reqNewline = false;
    let linesAtValue = 0;
    const lines = [];
    for (let i = 0;i < items.length; ++i) {
      const item = items[i];
      let comment = null;
      if (identity.isNode(item)) {
        if (item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, false);
        if (item.comment)
          comment = item.comment;
      } else if (identity.isPair(item)) {
        const ik = identity.isNode(item.key) ? item.key : null;
        if (ik) {
          if (ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, false);
          if (ik.comment)
            reqNewline = true;
        }
        const iv = identity.isNode(item.value) ? item.value : null;
        if (iv) {
          if (iv.comment)
            comment = iv.comment;
          if (iv.commentBefore)
            reqNewline = true;
        } else if (item.value == null && ik?.comment) {
          comment = ik.comment;
        }
      }
      if (comment)
        reqNewline = true;
      let str2 = stringify2.stringify(item, itemCtx, () => comment = null);
      if (i < items.length - 1)
        str2 += ",";
      if (comment)
        str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment));
      if (!reqNewline && (lines.length > linesAtValue || str2.includes(`
`)))
        reqNewline = true;
      lines.push(str2);
      linesAtValue = lines.length;
    }
    const { start, end } = flowChars;
    if (lines.length === 0) {
      return start + end;
    } else {
      if (!reqNewline) {
        const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
        reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
      }
      if (reqNewline) {
        let str2 = start;
        for (const line of lines)
          str2 += line ? `
${indentStep}${indent}${line}` : `
`;
        return `${str2}
${indent}${end}`;
      } else {
        return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
      }
    }
  }
  function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
    if (comment && chompKeep)
      comment = comment.replace(/^\n+/, "");
    if (comment) {
      const ic = stringifyComment.indentComment(commentString(comment), indent);
      lines.push(ic.trimStart());
    }
  }
  exports.stringifyCollection = stringifyCollection;
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS((exports) => {
  var stringifyCollection = require_stringifyCollection();
  var addPairToJSMap = require_addPairToJSMap();
  var Collection = require_Collection();
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  function findPair(items, key) {
    const k = identity.isScalar(key) ? key.value : key;
    for (const it of items) {
      if (identity.isPair(it)) {
        if (it.key === key || it.key === k)
          return it;
        if (identity.isScalar(it.key) && it.key.value === k)
          return it;
      }
    }
    return;
  }

  class YAMLMap extends Collection.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:map";
    }
    constructor(schema) {
      super(identity.MAP, schema);
      this.items = [];
    }
    static from(schema, obj, ctx) {
      const { keepUndefined, replacer } = ctx;
      const map = new this(schema);
      const add = (key, value) => {
        if (typeof replacer === "function")
          value = replacer.call(obj, key, value);
        else if (Array.isArray(replacer) && !replacer.includes(key))
          return;
        if (value !== undefined || keepUndefined)
          map.items.push(Pair.createPair(key, value, ctx));
      };
      if (obj instanceof Map) {
        for (const [key, value] of obj)
          add(key, value);
      } else if (obj && typeof obj === "object") {
        for (const key of Object.keys(obj))
          add(key, obj[key]);
      }
      if (typeof schema.sortMapEntries === "function") {
        map.items.sort(schema.sortMapEntries);
      }
      return map;
    }
    add(pair, overwrite) {
      let _pair;
      if (identity.isPair(pair))
        _pair = pair;
      else if (!pair || typeof pair !== "object" || !("key" in pair)) {
        _pair = new Pair.Pair(pair, pair?.value);
      } else
        _pair = new Pair.Pair(pair.key, pair.value);
      const prev = findPair(this.items, _pair.key);
      const sortEntries = this.schema?.sortMapEntries;
      if (prev) {
        if (!overwrite)
          throw new Error(`Key ${_pair.key} already set`);
        if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
          prev.value.value = _pair.value;
        else
          prev.value = _pair.value;
      } else if (sortEntries) {
        const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
        if (i === -1)
          this.items.push(_pair);
        else
          this.items.splice(i, 0, _pair);
      } else {
        this.items.push(_pair);
      }
    }
    delete(key) {
      const it = findPair(this.items, key);
      if (!it)
        return false;
      const del = this.items.splice(this.items.indexOf(it), 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const it = findPair(this.items, key);
      const node = it?.value;
      return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? undefined;
    }
    has(key) {
      return !!findPair(this.items, key);
    }
    set(key, value) {
      this.add(new Pair.Pair(key, value), true);
    }
    toJSON(_, ctx, Type) {
      const map = Type ? new Type : ctx?.mapAsMap ? new Map : {};
      if (ctx?.onCreate)
        ctx.onCreate(map);
      for (const item of this.items)
        addPairToJSMap.addPairToJSMap(ctx, map, item);
      return map;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      for (const item of this.items) {
        if (!identity.isPair(item))
          throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
      }
      if (!ctx.allNullValues && this.hasAllNullValues(false))
        ctx = Object.assign({}, ctx, { allNullValues: true });
      return stringifyCollection.stringifyCollection(this, ctx, {
        blockItemPrefix: "",
        flowChars: { start: "{", end: "}" },
        itemIndent: ctx.indent || "",
        onChompKeep,
        onComment
      });
    }
  }
  exports.YAMLMap = YAMLMap;
  exports.findPair = findPair;
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS((exports) => {
  var identity = require_identity();
  var YAMLMap = require_YAMLMap();
  var map = {
    collection: "map",
    default: true,
    nodeClass: YAMLMap.YAMLMap,
    tag: "tag:yaml.org,2002:map",
    resolve(map2, onError) {
      if (!identity.isMap(map2))
        onError("Expected a mapping for this tag");
      return map2;
    },
    createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
  };
  exports.map = map;
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS((exports) => {
  var createNode = require_createNode();
  var stringifyCollection = require_stringifyCollection();
  var Collection = require_Collection();
  var identity = require_identity();
  var Scalar = require_Scalar();
  var toJS = require_toJS();

  class YAMLSeq extends Collection.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:seq";
    }
    constructor(schema) {
      super(identity.SEQ, schema);
      this.items = [];
    }
    add(value) {
      this.items.push(value);
    }
    delete(key) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return false;
      const del = this.items.splice(idx, 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return;
      const it = this.items[idx];
      return !keepScalar && identity.isScalar(it) ? it.value : it;
    }
    has(key) {
      const idx = asItemIndex(key);
      return typeof idx === "number" && idx < this.items.length;
    }
    set(key, value) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        throw new Error(`Expected a valid index, not ${key}.`);
      const prev = this.items[idx];
      if (identity.isScalar(prev) && Scalar.isScalarValue(value))
        prev.value = value;
      else
        this.items[idx] = value;
    }
    toJSON(_, ctx) {
      const seq = [];
      if (ctx?.onCreate)
        ctx.onCreate(seq);
      let i = 0;
      for (const item of this.items)
        seq.push(toJS.toJS(item, String(i++), ctx));
      return seq;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      return stringifyCollection.stringifyCollection(this, ctx, {
        blockItemPrefix: "- ",
        flowChars: { start: "[", end: "]" },
        itemIndent: (ctx.indent || "") + "  ",
        onChompKeep,
        onComment
      });
    }
    static from(schema, obj, ctx) {
      const { replacer } = ctx;
      const seq = new this(schema);
      if (obj && Symbol.iterator in Object(obj)) {
        let i = 0;
        for (let it of obj) {
          if (typeof replacer === "function") {
            const key = obj instanceof Set ? it : String(i++);
            it = replacer.call(obj, key, it);
          }
          seq.items.push(createNode.createNode(it, undefined, ctx));
        }
      }
      return seq;
    }
  }
  function asItemIndex(key) {
    let idx = identity.isScalar(key) ? key.value : key;
    if (idx && typeof idx === "string")
      idx = Number(idx);
    return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
  }
  exports.YAMLSeq = YAMLSeq;
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS((exports) => {
  var identity = require_identity();
  var YAMLSeq = require_YAMLSeq();
  var seq = {
    collection: "seq",
    default: true,
    nodeClass: YAMLSeq.YAMLSeq,
    tag: "tag:yaml.org,2002:seq",
    resolve(seq2, onError) {
      if (!identity.isSeq(seq2))
        onError("Expected a sequence for this tag");
      return seq2;
    },
    createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
  };
  exports.seq = seq;
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS((exports) => {
  var stringifyString = require_stringifyString();
  var string = {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str2) => str2,
    stringify(item, ctx, onComment, onChompKeep) {
      ctx = Object.assign({ actualString: true }, ctx);
      return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
    }
  };
  exports.string = string;
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var nullTag = {
    identify: (value) => value == null,
    createNode: () => new Scalar.Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new Scalar.Scalar(null),
    stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
  };
  exports.nullTag = nullTag;
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var boolTag = {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: (str2) => new Scalar.Scalar(str2[0] === "t" || str2[0] === "T"),
    stringify({ source, value }, ctx) {
      if (source && boolTag.test.test(source)) {
        const sv = source[0] === "t" || source[0] === "T";
        if (value === sv)
          return source;
      }
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
  };
  exports.boolTag = boolTag;
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS((exports) => {
  function stringifyNumber({ format, minFractionDigits, tag, value }) {
    if (typeof value === "bigint")
      return String(value);
    const num = typeof value === "number" ? value : Number(value);
    if (!isFinite(num))
      return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
    let n = JSON.stringify(value);
    if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^\d/.test(n)) {
      let i = n.indexOf(".");
      if (i < 0) {
        i = n.length;
        n += ".";
      }
      let d = minFractionDigits - (n.length - i - 1);
      while (d-- > 0)
        n += "0";
    }
    return n;
  }
  exports.stringifyNumber = stringifyNumber;
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var stringifyNumber = require_stringifyNumber();
  var floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
  };
  var floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: (str2) => parseFloat(str2),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
  };
  var float = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(str2) {
      const node = new Scalar.Scalar(parseFloat(str2));
      const dot = str2.indexOf(".");
      if (dot !== -1 && str2[str2.length - 1] === "0")
        node.minFractionDigits = str2.length - dot - 1;
      return node;
    },
    stringify: stringifyNumber.stringifyNumber
  };
  exports.float = float;
  exports.floatExp = floatExp;
  exports.floatNaN = floatNaN;
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS((exports) => {
  var stringifyNumber = require_stringifyNumber();
  var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  var intResolve = (str2, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2.substring(offset), radix);
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value) && value >= 0)
      return prefix + value.toString(radix);
    return stringifyNumber.stringifyNumber(node);
  }
  var intOct = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^0o[0-7]+$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 2, 8, opt),
    stringify: (node) => intStringify(node, 8, "0o")
  };
  var int = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9]+$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
  };
  var intHex = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  exports.int = int;
  exports.intHex = intHex;
  exports.intOct = intOct;
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS((exports) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var bool = require_bool();
  var float = require_float();
  var int = require_int();
  var schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.boolTag,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float
  ];
  exports.schema = schema;
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var map = require_map();
  var seq = require_seq();
  function intIdentify(value) {
    return typeof value === "bigint" || Number.isInteger(value);
  }
  var stringifyJSON = ({ value }) => JSON.stringify(value);
  var jsonScalars = [
    {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str2) => str2,
      stringify: stringifyJSON
    },
    {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^null$/,
      resolve: () => null,
      stringify: stringifyJSON
    },
    {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^true$|^false$/,
      resolve: (str2) => str2 === "true",
      stringify: stringifyJSON
    },
    {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^-?(?:0|[1-9][0-9]*)$/,
      resolve: (str2, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2, 10),
      stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
    },
    {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
      resolve: (str2) => parseFloat(str2),
      stringify: stringifyJSON
    }
  ];
  var jsonError = {
    default: true,
    tag: "",
    test: /^/,
    resolve(str2, onError) {
      onError(`Unresolved plain scalar ${JSON.stringify(str2)}`);
      return str2;
    }
  };
  var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
  exports.schema = schema;
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS((exports) => {
  var node_buffer = __require("buffer");
  var Scalar = require_Scalar();
  var stringifyString = require_stringifyString();
  var binary = {
    identify: (value) => value instanceof Uint8Array,
    default: false,
    tag: "tag:yaml.org,2002:binary",
    resolve(src, onError) {
      if (typeof node_buffer.Buffer === "function") {
        return node_buffer.Buffer.from(src, "base64");
      } else if (typeof atob === "function") {
        const str2 = atob(src.replace(/[\n\r]/g, ""));
        const buffer = new Uint8Array(str2.length);
        for (let i = 0;i < str2.length; ++i)
          buffer[i] = str2.charCodeAt(i);
        return buffer;
      } else {
        onError("This environment does not support reading binary tags; either Buffer or atob is required");
        return src;
      }
    },
    stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
      if (!value)
        return "";
      const buf = value;
      let str2;
      if (typeof node_buffer.Buffer === "function") {
        str2 = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
      } else if (typeof btoa === "function") {
        let s = "";
        for (let i = 0;i < buf.length; ++i)
          s += String.fromCharCode(buf[i]);
        str2 = btoa(s);
      } else {
        throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
      }
      type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
        const n = Math.ceil(str2.length / lineWidth);
        const lines = new Array(n);
        for (let i = 0, o = 0;i < n; ++i, o += lineWidth) {
          lines[i] = str2.substr(o, lineWidth);
        }
        str2 = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? `
` : " ");
      }
      return stringifyString.stringifyString({ comment, type, value: str2 }, ctx, onComment, onChompKeep);
    }
  };
  exports.binary = binary;
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS((exports) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  var YAMLSeq = require_YAMLSeq();
  function resolvePairs(seq, onError) {
    if (identity.isSeq(seq)) {
      for (let i = 0;i < seq.items.length; ++i) {
        let item = seq.items[i];
        if (identity.isPair(item))
          continue;
        else if (identity.isMap(item)) {
          if (item.items.length > 1)
            onError("Each pair must have its own sequence indicator");
          const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
          if (item.commentBefore)
            pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
          if (item.comment) {
            const cn = pair.value ?? pair.key;
            cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
          }
          item = pair;
        }
        seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
      }
    } else
      onError("Expected a sequence for this tag");
    return seq;
  }
  function createPairs(schema, iterable, ctx) {
    const { replacer } = ctx;
    const pairs2 = new YAMLSeq.YAMLSeq(schema);
    pairs2.tag = "tag:yaml.org,2002:pairs";
    let i = 0;
    if (iterable && Symbol.iterator in Object(iterable))
      for (let it of iterable) {
        if (typeof replacer === "function")
          it = replacer.call(iterable, String(i++), it);
        let key, value;
        if (Array.isArray(it)) {
          if (it.length === 2) {
            key = it[0];
            value = it[1];
          } else
            throw new TypeError(`Expected [key, value] tuple: ${it}`);
        } else if (it && it instanceof Object) {
          const keys = Object.keys(it);
          if (keys.length === 1) {
            key = keys[0];
            value = it[key];
          } else {
            throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
          }
        } else {
          key = it;
        }
        pairs2.items.push(Pair.createPair(key, value, ctx));
      }
    return pairs2;
  }
  var pairs = {
    collection: "seq",
    default: false,
    tag: "tag:yaml.org,2002:pairs",
    resolve: resolvePairs,
    createNode: createPairs
  };
  exports.createPairs = createPairs;
  exports.pairs = pairs;
  exports.resolvePairs = resolvePairs;
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS((exports) => {
  var identity = require_identity();
  var toJS = require_toJS();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var pairs = require_pairs();

  class YAMLOMap extends YAMLSeq.YAMLSeq {
    constructor() {
      super();
      this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
      this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
      this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
      this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
      this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
      this.tag = YAMLOMap.tag;
    }
    toJSON(_, ctx) {
      if (!ctx)
        return super.toJSON(_);
      const map = new Map;
      if (ctx?.onCreate)
        ctx.onCreate(map);
      for (const pair of this.items) {
        let key, value;
        if (identity.isPair(pair)) {
          key = toJS.toJS(pair.key, "", ctx);
          value = toJS.toJS(pair.value, key, ctx);
        } else {
          key = toJS.toJS(pair, "", ctx);
        }
        if (map.has(key))
          throw new Error("Ordered maps must not include duplicate keys");
        map.set(key, value);
      }
      return map;
    }
    static from(schema, iterable, ctx) {
      const pairs$1 = pairs.createPairs(schema, iterable, ctx);
      const omap2 = new this;
      omap2.items = pairs$1.items;
      return omap2;
    }
  }
  YAMLOMap.tag = "tag:yaml.org,2002:omap";
  var omap = {
    collection: "seq",
    identify: (value) => value instanceof Map,
    nodeClass: YAMLOMap,
    default: false,
    tag: "tag:yaml.org,2002:omap",
    resolve(seq, onError) {
      const pairs$1 = pairs.resolvePairs(seq, onError);
      const seenKeys = [];
      for (const { key } of pairs$1.items) {
        if (identity.isScalar(key)) {
          if (seenKeys.includes(key.value)) {
            onError(`Ordered maps must not include duplicate keys: ${key.value}`);
          } else {
            seenKeys.push(key.value);
          }
        }
      }
      return Object.assign(new YAMLOMap, pairs$1);
    },
    createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
  };
  exports.YAMLOMap = YAMLOMap;
  exports.omap = omap;
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS((exports) => {
  var Scalar = require_Scalar();
  function boolStringify({ value, source }, ctx) {
    const boolObj = value ? trueTag : falseTag;
    if (source && boolObj.test.test(source))
      return source;
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
  var trueTag = {
    identify: (value) => value === true,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new Scalar.Scalar(true),
    stringify: boolStringify
  };
  var falseTag = {
    identify: (value) => value === false,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new Scalar.Scalar(false),
    stringify: boolStringify
  };
  exports.falseTag = falseTag;
  exports.trueTag = trueTag;
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var stringifyNumber = require_stringifyNumber();
  var floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
  };
  var floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (str2) => parseFloat(str2.replace(/_/g, "")),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
  };
  var float = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(str2) {
      const node = new Scalar.Scalar(parseFloat(str2.replace(/_/g, "")));
      const dot = str2.indexOf(".");
      if (dot !== -1) {
        const f = str2.substring(dot + 1).replace(/_/g, "");
        if (f[f.length - 1] === "0")
          node.minFractionDigits = f.length;
      }
      return node;
    },
    stringify: stringifyNumber.stringifyNumber
  };
  exports.float = float;
  exports.floatExp = floatExp;
  exports.floatNaN = floatNaN;
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS((exports) => {
  var stringifyNumber = require_stringifyNumber();
  var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  function intResolve(str2, offset, radix, { intAsBigInt }) {
    const sign = str2[0];
    if (sign === "-" || sign === "+")
      offset += 1;
    str2 = str2.substring(offset).replace(/_/g, "");
    if (intAsBigInt) {
      switch (radix) {
        case 2:
          str2 = `0b${str2}`;
          break;
        case 8:
          str2 = `0o${str2}`;
          break;
        case 16:
          str2 = `0x${str2}`;
          break;
      }
      const n2 = BigInt(str2);
      return sign === "-" ? BigInt(-1) * n2 : n2;
    }
    const n = parseInt(str2, radix);
    return sign === "-" ? -1 * n : n;
  }
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value)) {
      const str2 = value.toString(radix);
      return value < 0 ? "-" + prefix + str2.substr(1) : prefix + str2;
    }
    return stringifyNumber.stringifyNumber(node);
  }
  var intBin = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "BIN",
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 2, 2, opt),
    stringify: (node) => intStringify(node, 2, "0b")
  };
  var intOct = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^[-+]?0[0-7_]+$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 1, 8, opt),
    stringify: (node) => intStringify(node, 8, "0")
  };
  var int = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
  };
  var intHex = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  exports.int = int;
  exports.intBin = intBin;
  exports.intHex = intHex;
  exports.intOct = intOct;
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS((exports) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();

  class YAMLSet extends YAMLMap.YAMLMap {
    constructor(schema) {
      super(schema);
      this.tag = YAMLSet.tag;
    }
    add(key) {
      let pair;
      if (identity.isPair(key))
        pair = key;
      else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
        pair = new Pair.Pair(key.key, null);
      else
        pair = new Pair.Pair(key, null);
      const prev = YAMLMap.findPair(this.items, pair.key);
      if (!prev)
        this.items.push(pair);
    }
    get(key, keepPair) {
      const pair = YAMLMap.findPair(this.items, key);
      return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
    }
    set(key, value) {
      if (typeof value !== "boolean")
        throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
      const prev = YAMLMap.findPair(this.items, key);
      if (prev && !value) {
        this.items.splice(this.items.indexOf(prev), 1);
      } else if (!prev && value) {
        this.items.push(new Pair.Pair(key));
      }
    }
    toJSON(_, ctx) {
      return super.toJSON(_, ctx, Set);
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      if (this.hasAllNullValues(true))
        return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
      else
        throw new Error("Set items must all have null values");
    }
    static from(schema, iterable, ctx) {
      const { replacer } = ctx;
      const set2 = new this(schema);
      if (iterable && Symbol.iterator in Object(iterable))
        for (let value of iterable) {
          if (typeof replacer === "function")
            value = replacer.call(iterable, value, value);
          set2.items.push(Pair.createPair(value, null, ctx));
        }
      return set2;
    }
  }
  YAMLSet.tag = "tag:yaml.org,2002:set";
  var set = {
    collection: "map",
    identify: (value) => value instanceof Set,
    nodeClass: YAMLSet,
    default: false,
    tag: "tag:yaml.org,2002:set",
    createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
    resolve(map, onError) {
      if (identity.isMap(map)) {
        if (map.hasAllNullValues(true))
          return Object.assign(new YAMLSet, map);
        else
          onError("Set items must all have null values");
      } else
        onError("Expected a mapping for this tag");
      return map;
    }
  };
  exports.YAMLSet = YAMLSet;
  exports.set = set;
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS((exports) => {
  var stringifyNumber = require_stringifyNumber();
  function parseSexagesimal(str2, asBigInt) {
    const sign = str2[0];
    const parts = sign === "-" || sign === "+" ? str2.substring(1) : str2;
    const num = (n) => asBigInt ? BigInt(n) : Number(n);
    const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
    return sign === "-" ? num(-1) * res : res;
  }
  function stringifySexagesimal(node) {
    let { value } = node;
    let num = (n) => n;
    if (typeof value === "bigint")
      num = (n) => BigInt(n);
    else if (isNaN(value) || !isFinite(value))
      return stringifyNumber.stringifyNumber(node);
    let sign = "";
    if (value < 0) {
      sign = "-";
      value *= num(-1);
    }
    const _60 = num(60);
    const parts = [value % _60];
    if (value < 60) {
      parts.unshift(0);
    } else {
      value = (value - parts[0]) / _60;
      parts.unshift(value % _60);
      if (value >= 60) {
        value = (value - parts[0]) / _60;
        parts.unshift(value);
      }
    }
    return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
  }
  var intTime = {
    identify: (value) => typeof value === "bigint" || Number.isInteger(value),
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (str2, _onError, { intAsBigInt }) => parseSexagesimal(str2, intAsBigInt),
    stringify: stringifySexagesimal
  };
  var floatTime = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: (str2) => parseSexagesimal(str2, false),
    stringify: stringifySexagesimal
  };
  var timestamp = {
    identify: (value) => value instanceof Date,
    default: true,
    tag: "tag:yaml.org,2002:timestamp",
    test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})" + "(?:" + "(?:t|T|[ \\t]+)" + "([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)" + "(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?" + ")?$"),
    resolve(str2) {
      const match = str2.match(timestamp.test);
      if (!match)
        throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
      const [, year, month, day, hour, minute, second] = match.map(Number);
      const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
      let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
      const tz = match[8];
      if (tz && tz !== "Z") {
        let d = parseSexagesimal(tz, false);
        if (Math.abs(d) < 30)
          d *= 60;
        date -= 60000 * d;
      }
      return new Date(date);
    },
    stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
  };
  exports.floatTime = floatTime;
  exports.intTime = intTime;
  exports.timestamp = timestamp;
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS((exports) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var binary = require_binary();
  var bool = require_bool2();
  var float = require_float2();
  var int = require_int2();
  var merge = require_merge();
  var omap = require_omap();
  var pairs = require_pairs();
  var set = require_set();
  var timestamp = require_timestamp();
  var schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.trueTag,
    bool.falseTag,
    int.intBin,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float,
    binary.binary,
    merge.merge,
    omap.omap,
    pairs.pairs,
    set.set,
    timestamp.intTime,
    timestamp.floatTime,
    timestamp.timestamp
  ];
  exports.schema = schema;
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS((exports) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var bool = require_bool();
  var float = require_float();
  var int = require_int();
  var schema = require_schema();
  var schema$1 = require_schema2();
  var binary = require_binary();
  var merge = require_merge();
  var omap = require_omap();
  var pairs = require_pairs();
  var schema$2 = require_schema3();
  var set = require_set();
  var timestamp = require_timestamp();
  var schemas = new Map([
    ["core", schema.schema],
    ["failsafe", [map.map, seq.seq, string.string]],
    ["json", schema$1.schema],
    ["yaml11", schema$2.schema],
    ["yaml-1.1", schema$2.schema]
  ]);
  var tagsByName = {
    binary: binary.binary,
    bool: bool.boolTag,
    float: float.float,
    floatExp: float.floatExp,
    floatNaN: float.floatNaN,
    floatTime: timestamp.floatTime,
    int: int.int,
    intHex: int.intHex,
    intOct: int.intOct,
    intTime: timestamp.intTime,
    map: map.map,
    merge: merge.merge,
    null: _null.nullTag,
    omap: omap.omap,
    pairs: pairs.pairs,
    seq: seq.seq,
    set: set.set,
    timestamp: timestamp.timestamp
  };
  var coreKnownTags = {
    "tag:yaml.org,2002:binary": binary.binary,
    "tag:yaml.org,2002:merge": merge.merge,
    "tag:yaml.org,2002:omap": omap.omap,
    "tag:yaml.org,2002:pairs": pairs.pairs,
    "tag:yaml.org,2002:set": set.set,
    "tag:yaml.org,2002:timestamp": timestamp.timestamp
  };
  function getTags(customTags, schemaName, addMergeTag) {
    const schemaTags = schemas.get(schemaName);
    if (schemaTags && !customTags) {
      return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
    }
    let tags = schemaTags;
    if (!tags) {
      if (Array.isArray(customTags))
        tags = [];
      else {
        const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
      }
    }
    if (Array.isArray(customTags)) {
      for (const tag of customTags)
        tags = tags.concat(tag);
    } else if (typeof customTags === "function") {
      tags = customTags(tags.slice());
    }
    if (addMergeTag)
      tags = tags.concat(merge.merge);
    return tags.reduce((tags2, tag) => {
      const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
      if (!tagObj) {
        const tagName = JSON.stringify(tag);
        const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
      }
      if (!tags2.includes(tagObj))
        tags2.push(tagObj);
      return tags2;
    }, []);
  }
  exports.coreKnownTags = coreKnownTags;
  exports.getTags = getTags;
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS((exports) => {
  var identity = require_identity();
  var map = require_map();
  var seq = require_seq();
  var string = require_string();
  var tags = require_tags();
  var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

  class Schema {
    constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
      this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
      this.name = typeof schema === "string" && schema || "core";
      this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
      this.tags = tags.getTags(customTags, this.name, merge);
      this.toStringOptions = toStringDefaults ?? null;
      Object.defineProperty(this, identity.MAP, { value: map.map });
      Object.defineProperty(this, identity.SCALAR, { value: string.string });
      Object.defineProperty(this, identity.SEQ, { value: seq.seq });
      this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
    }
    clone() {
      const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
      copy.tags = this.tags.slice();
      return copy;
    }
  }
  exports.Schema = Schema;
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS((exports) => {
  var identity = require_identity();
  var stringify2 = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyDocument(doc, options) {
    const lines = [];
    let hasDirectives = options.directives === true;
    if (options.directives !== false && doc.directives) {
      const dir = doc.directives.toString(doc);
      if (dir) {
        lines.push(dir);
        hasDirectives = true;
      } else if (doc.directives.docStart)
        hasDirectives = true;
    }
    if (hasDirectives)
      lines.push("---");
    const ctx = stringify2.createStringifyContext(doc, options);
    const { commentString } = ctx.options;
    if (doc.commentBefore) {
      if (lines.length !== 1)
        lines.unshift("");
      const cs = commentString(doc.commentBefore);
      lines.unshift(stringifyComment.indentComment(cs, ""));
    }
    let chompKeep = false;
    let contentComment = null;
    if (doc.contents) {
      if (identity.isNode(doc.contents)) {
        if (doc.contents.spaceBefore && hasDirectives)
          lines.push("");
        if (doc.contents.commentBefore) {
          const cs = commentString(doc.contents.commentBefore);
          lines.push(stringifyComment.indentComment(cs, ""));
        }
        ctx.forceBlockIndent = !!doc.comment;
        contentComment = doc.contents.comment;
      }
      const onChompKeep = contentComment ? undefined : () => chompKeep = true;
      let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
      if (contentComment)
        body += stringifyComment.lineComment(body, "", commentString(contentComment));
      if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
        lines[lines.length - 1] = `--- ${body}`;
      } else
        lines.push(body);
    } else {
      lines.push(stringify2.stringify(doc.contents, ctx));
    }
    if (doc.directives?.docEnd) {
      if (doc.comment) {
        const cs = commentString(doc.comment);
        if (cs.includes(`
`)) {
          lines.push("...");
          lines.push(stringifyComment.indentComment(cs, ""));
        } else {
          lines.push(`... ${cs}`);
        }
      } else {
        lines.push("...");
      }
    } else {
      let dc = doc.comment;
      if (dc && chompKeep)
        dc = dc.replace(/^\n+/, "");
      if (dc) {
        if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
          lines.push("");
        lines.push(stringifyComment.indentComment(commentString(dc), ""));
      }
    }
    return lines.join(`
`) + `
`;
  }
  exports.stringifyDocument = stringifyDocument;
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS((exports) => {
  var Alias = require_Alias();
  var Collection = require_Collection();
  var identity = require_identity();
  var Pair = require_Pair();
  var toJS = require_toJS();
  var Schema = require_Schema();
  var stringifyDocument = require_stringifyDocument();
  var anchors = require_anchors();
  var applyReviver = require_applyReviver();
  var createNode = require_createNode();
  var directives = require_directives();

  class Document {
    constructor(value, replacer, options) {
      this.commentBefore = null;
      this.comment = null;
      this.errors = [];
      this.warnings = [];
      Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === undefined && replacer) {
        options = replacer;
        replacer = undefined;
      }
      const opt = Object.assign({
        intAsBigInt: false,
        keepSourceTokens: false,
        logLevel: "warn",
        prettyErrors: true,
        strict: true,
        stringKeys: false,
        uniqueKeys: true,
        version: "1.2"
      }, options);
      this.options = opt;
      let { version } = opt;
      if (options?._directives) {
        this.directives = options._directives.atDocument();
        if (this.directives.yaml.explicit)
          version = this.directives.yaml.version;
      } else
        this.directives = new directives.Directives({ version });
      this.setSchema(version, options);
      this.contents = value === undefined ? null : this.createNode(value, _replacer, options);
    }
    clone() {
      const copy = Object.create(Document.prototype, {
        [identity.NODE_TYPE]: { value: identity.DOC }
      });
      copy.commentBefore = this.commentBefore;
      copy.comment = this.comment;
      copy.errors = this.errors.slice();
      copy.warnings = this.warnings.slice();
      copy.options = Object.assign({}, this.options);
      if (this.directives)
        copy.directives = this.directives.clone();
      copy.schema = this.schema.clone();
      copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    add(value) {
      if (assertCollection(this.contents))
        this.contents.add(value);
    }
    addIn(path13, value) {
      if (assertCollection(this.contents))
        this.contents.addIn(path13, value);
    }
    createAlias(node, name) {
      if (!node.anchor) {
        const prev = anchors.anchorNames(this);
        node.anchor = !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
      }
      return new Alias.Alias(node.anchor);
    }
    createNode(value, replacer, options) {
      let _replacer = undefined;
      if (typeof replacer === "function") {
        value = replacer.call({ "": value }, "", value);
        _replacer = replacer;
      } else if (Array.isArray(replacer)) {
        const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
        const asStr = replacer.filter(keyToStr).map(String);
        if (asStr.length > 0)
          replacer = replacer.concat(asStr);
        _replacer = replacer;
      } else if (options === undefined && replacer) {
        options = replacer;
        replacer = undefined;
      }
      const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
      const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, anchorPrefix || "a");
      const ctx = {
        aliasDuplicateObjects: aliasDuplicateObjects ?? true,
        keepUndefined: keepUndefined ?? false,
        onAnchor,
        onTagObj,
        replacer: _replacer,
        schema: this.schema,
        sourceObjects
      };
      const node = createNode.createNode(value, tag, ctx);
      if (flow && identity.isCollection(node))
        node.flow = true;
      setAnchors();
      return node;
    }
    createPair(key, value, options = {}) {
      const k = this.createNode(key, null, options);
      const v = this.createNode(value, null, options);
      return new Pair.Pair(k, v);
    }
    delete(key) {
      return assertCollection(this.contents) ? this.contents.delete(key) : false;
    }
    deleteIn(path13) {
      if (Collection.isEmptyPath(path13)) {
        if (this.contents == null)
          return false;
        this.contents = null;
        return true;
      }
      return assertCollection(this.contents) ? this.contents.deleteIn(path13) : false;
    }
    get(key, keepScalar) {
      return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : undefined;
    }
    getIn(path13, keepScalar) {
      if (Collection.isEmptyPath(path13))
        return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
      return identity.isCollection(this.contents) ? this.contents.getIn(path13, keepScalar) : undefined;
    }
    has(key) {
      return identity.isCollection(this.contents) ? this.contents.has(key) : false;
    }
    hasIn(path13) {
      if (Collection.isEmptyPath(path13))
        return this.contents !== undefined;
      return identity.isCollection(this.contents) ? this.contents.hasIn(path13) : false;
    }
    set(key, value) {
      if (this.contents == null) {
        this.contents = Collection.collectionFromPath(this.schema, [key], value);
      } else if (assertCollection(this.contents)) {
        this.contents.set(key, value);
      }
    }
    setIn(path13, value) {
      if (Collection.isEmptyPath(path13)) {
        this.contents = value;
      } else if (this.contents == null) {
        this.contents = Collection.collectionFromPath(this.schema, Array.from(path13), value);
      } else if (assertCollection(this.contents)) {
        this.contents.setIn(path13, value);
      }
    }
    setSchema(version, options = {}) {
      if (typeof version === "number")
        version = String(version);
      let opt;
      switch (version) {
        case "1.1":
          if (this.directives)
            this.directives.yaml.version = "1.1";
          else
            this.directives = new directives.Directives({ version: "1.1" });
          opt = { resolveKnownTags: false, schema: "yaml-1.1" };
          break;
        case "1.2":
        case "next":
          if (this.directives)
            this.directives.yaml.version = version;
          else
            this.directives = new directives.Directives({ version });
          opt = { resolveKnownTags: true, schema: "core" };
          break;
        case null:
          if (this.directives)
            delete this.directives;
          opt = null;
          break;
        default: {
          const sv = JSON.stringify(version);
          throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
        }
      }
      if (options.schema instanceof Object)
        this.schema = options.schema;
      else if (opt)
        this.schema = new Schema.Schema(Object.assign(opt, options));
      else
        throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
    }
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      const ctx = {
        anchors: new Map,
        doc: this,
        keep: !json,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
    }
    toJSON(jsonArg, onAnchor) {
      return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
    }
    toString(options = {}) {
      if (this.errors.length > 0)
        throw new Error("Document with errors cannot be stringified");
      if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
        const s = JSON.stringify(options.indent);
        throw new Error(`"indent" option must be a positive integer, not ${s}`);
      }
      return stringifyDocument.stringifyDocument(this, options);
    }
  }
  function assertCollection(contents) {
    if (identity.isCollection(contents))
      return true;
    throw new Error("Expected a YAML collection as document contents");
  }
  exports.Document = Document;
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS((exports) => {
  class YAMLError extends Error {
    constructor(name, pos, code, message) {
      super();
      this.name = name;
      this.code = code;
      this.message = message;
      this.pos = pos;
    }
  }

  class YAMLParseError extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLParseError", pos, code, message);
    }
  }

  class YAMLWarning extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLWarning", pos, code, message);
    }
  }
  var prettifyError = (src, lc) => (error) => {
    if (error.pos[0] === -1)
      return;
    error.linePos = error.pos.map((pos) => lc.linePos(pos));
    const { line, col } = error.linePos[0];
    error.message += ` at line ${line}, column ${col}`;
    let ci = col - 1;
    let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
    if (ci >= 60 && lineStr.length > 80) {
      const trimStart = Math.min(ci - 39, lineStr.length - 79);
      lineStr = "…" + lineStr.substring(trimStart);
      ci -= trimStart - 1;
    }
    if (lineStr.length > 80)
      lineStr = lineStr.substring(0, 79) + "…";
    if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
      let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
      if (prev.length > 80)
        prev = prev.substring(0, 79) + `…
`;
      lineStr = prev + lineStr;
    }
    if (/[^ ]/.test(lineStr)) {
      let count = 1;
      const end = error.linePos[1];
      if (end && end.line === line && end.col > col) {
        count = Math.max(1, Math.min(end.col - col, 80 - ci));
      }
      const pointer = " ".repeat(ci) + "^".repeat(count);
      error.message += `:

${lineStr}
${pointer}
`;
    }
  };
  exports.YAMLError = YAMLError;
  exports.YAMLParseError = YAMLParseError;
  exports.YAMLWarning = YAMLWarning;
  exports.prettifyError = prettifyError;
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS((exports) => {
  function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
    let spaceBefore = false;
    let atNewline = startOnNewline;
    let hasSpace = startOnNewline;
    let comment = "";
    let commentSep = "";
    let hasNewline = false;
    let reqSpace = false;
    let tab = null;
    let anchor = null;
    let tag = null;
    let newlineAfterProp = null;
    let comma = null;
    let found = null;
    let start = null;
    for (const token of tokens) {
      if (reqSpace) {
        if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
          onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
        reqSpace = false;
      }
      if (tab) {
        if (atNewline && token.type !== "comment" && token.type !== "newline") {
          onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
        }
        tab = null;
      }
      switch (token.type) {
        case "space":
          if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("\t")) {
            tab = token;
          }
          hasSpace = true;
          break;
        case "comment": {
          if (!hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = token.source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += commentSep + cb;
          commentSep = "";
          atNewline = false;
          break;
        }
        case "newline":
          if (atNewline) {
            if (comment)
              comment += token.source;
            else if (!found || indicator !== "seq-item-ind")
              spaceBefore = true;
          } else
            commentSep += token.source;
          atNewline = true;
          hasNewline = true;
          if (anchor || tag)
            newlineAfterProp = token;
          hasSpace = true;
          break;
        case "anchor":
          if (anchor)
            onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
          if (token.source.endsWith(":"))
            onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
          anchor = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        case "tag": {
          if (tag)
            onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
          tag = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        }
        case indicator:
          if (anchor || tag)
            onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
          if (found)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
          found = token;
          atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
          hasSpace = false;
          break;
        case "comma":
          if (flow) {
            if (comma)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
            comma = token;
            atNewline = false;
            hasSpace = false;
            break;
          }
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
          atNewline = false;
          hasSpace = false;
      }
    }
    const last = tokens[tokens.length - 1];
    const end = last ? last.offset + last.source.length : offset;
    if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
      onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
    }
    if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
      onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
    return {
      comma,
      found,
      spaceBefore,
      comment,
      hasNewline,
      anchor,
      tag,
      newlineAfterProp,
      end,
      start: start ?? end
    };
  }
  exports.resolveProps = resolveProps;
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS((exports) => {
  function containsNewline(key) {
    if (!key)
      return null;
    switch (key.type) {
      case "alias":
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        if (key.source.includes(`
`))
          return true;
        if (key.end) {
          for (const st of key.end)
            if (st.type === "newline")
              return true;
        }
        return false;
      case "flow-collection":
        for (const it of key.items) {
          for (const st of it.start)
            if (st.type === "newline")
              return true;
          if (it.sep) {
            for (const st of it.sep)
              if (st.type === "newline")
                return true;
          }
          if (containsNewline(it.key) || containsNewline(it.value))
            return true;
        }
        return false;
      default:
        return true;
    }
  }
  exports.containsNewline = containsNewline;
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS((exports) => {
  var utilContainsNewline = require_util_contains_newline();
  function flowIndentCheck(indent, fc, onError) {
    if (fc?.type === "flow-collection") {
      const end = fc.end[0];
      if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
        const msg = "Flow end indicator should be more indented than parent";
        onError(end, "BAD_INDENT", msg, true);
      }
    }
  }
  exports.flowIndentCheck = flowIndentCheck;
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS((exports) => {
  var identity = require_identity();
  function mapIncludes(ctx, items, search) {
    const { uniqueKeys } = ctx.options;
    if (uniqueKeys === false)
      return false;
    const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
    return items.some((pair) => isEqual(pair.key, search));
  }
  exports.mapIncludes = mapIncludes;
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS((exports) => {
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();
  var resolveProps = require_resolve_props();
  var utilContainsNewline = require_util_contains_newline();
  var utilFlowIndentCheck = require_util_flow_indent_check();
  var utilMapIncludes = require_util_map_includes();
  var startColMsg = "All mapping items must start at the same column";
  function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
    const map = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    let offset = bm.offset;
    let commentEnd = null;
    for (const collItem of bm.items) {
      const { start, key, sep: sep3, value } = collItem;
      const keyProps = resolveProps.resolveProps(start, {
        indicator: "explicit-key-ind",
        next: key ?? sep3?.[0],
        offset,
        onError,
        parentIndent: bm.indent,
        startOnNewline: true
      });
      const implicitKey = !keyProps.found;
      if (implicitKey) {
        if (key) {
          if (key.type === "block-seq")
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
          else if ("indent" in key && key.indent !== bm.indent)
            onError(offset, "BAD_INDENT", startColMsg);
        }
        if (!keyProps.anchor && !keyProps.tag && !sep3) {
          commentEnd = keyProps.end;
          if (keyProps.comment) {
            if (map.comment)
              map.comment += `
` + keyProps.comment;
            else
              map.comment = keyProps.comment;
          }
          continue;
        }
        if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
          onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
        }
      } else if (keyProps.found?.indent !== bm.indent) {
        onError(offset, "BAD_INDENT", startColMsg);
      }
      ctx.atKey = true;
      const keyStart = keyProps.end;
      const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
      ctx.atKey = false;
      if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
        onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
      const valueProps = resolveProps.resolveProps(sep3 ?? [], {
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: bm.indent,
        startOnNewline: !key || key.type === "block-scalar"
      });
      offset = valueProps.end;
      if (valueProps.found) {
        if (implicitKey) {
          if (value?.type === "block-map" && !valueProps.hasNewline)
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
          if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
            onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
        }
        const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep3, null, valueProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
        offset = valueNode.range[2];
        const pair = new Pair.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map.items.push(pair);
      } else {
        if (implicitKey)
          onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
        if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += `
` + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair.Pair(keyNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map.items.push(pair);
      }
    }
    if (commentEnd && commentEnd < offset)
      onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
    map.range = [bm.offset, offset, commentEnd ?? offset];
    return map;
  }
  exports.resolveBlockMap = resolveBlockMap;
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS((exports) => {
  var YAMLSeq = require_YAMLSeq();
  var resolveProps = require_resolve_props();
  var utilFlowIndentCheck = require_util_flow_indent_check();
  function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
    const seq = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = bs.offset;
    let commentEnd = null;
    for (const { start, value } of bs.items) {
      const props = resolveProps.resolveProps(start, {
        indicator: "seq-item-ind",
        next: value,
        offset,
        onError,
        parentIndent: bs.indent,
        startOnNewline: true
      });
      if (!props.found) {
        if (props.anchor || props.tag || value) {
          if (value && value.type === "block-seq")
            onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
          else
            onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
        } else {
          commentEnd = props.end;
          if (props.comment)
            seq.comment = props.comment;
          continue;
        }
      }
      const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
      offset = node.range[2];
      seq.items.push(node);
    }
    seq.range = [bs.offset, offset, commentEnd ?? offset];
    return seq;
  }
  exports.resolveBlockSeq = resolveBlockSeq;
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS((exports) => {
  function resolveEnd(end, offset, reqSpace, onError) {
    let comment = "";
    if (end) {
      let hasSpace = false;
      let sep3 = "";
      for (const token of end) {
        const { source, type } = token;
        switch (type) {
          case "space":
            hasSpace = true;
            break;
          case "comment": {
            if (reqSpace && !hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += sep3 + cb;
            sep3 = "";
            break;
          }
          case "newline":
            if (comment)
              sep3 += source;
            hasSpace = true;
            break;
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
        }
        offset += source.length;
      }
    }
    return { comment, offset };
  }
  exports.resolveEnd = resolveEnd;
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS((exports) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var resolveEnd = require_resolve_end();
  var resolveProps = require_resolve_props();
  var utilContainsNewline = require_util_contains_newline();
  var utilMapIncludes = require_util_map_includes();
  var blockMsg = "Block collections are not allowed within flow collections";
  var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
  function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
    const isMap = fc.start.source === "{";
    const fcName = isMap ? "flow map" : "flow sequence";
    const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
    const coll = new NodeClass(ctx.schema);
    coll.flow = true;
    const atRoot = ctx.atRoot;
    if (atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = fc.offset + fc.start.source.length;
    for (let i = 0;i < fc.items.length; ++i) {
      const collItem = fc.items[i];
      const { start, key, sep: sep3, value } = collItem;
      const props = resolveProps.resolveProps(start, {
        flow: fcName,
        indicator: "explicit-key-ind",
        next: key ?? sep3?.[0],
        offset,
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (!props.found) {
        if (!props.anchor && !props.tag && !sep3 && !value) {
          if (i === 0 && props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
          else if (i < fc.items.length - 1)
            onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
          if (props.comment) {
            if (coll.comment)
              coll.comment += `
` + props.comment;
            else
              coll.comment = props.comment;
          }
          offset = props.end;
          continue;
        }
        if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
          onError(key, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
      }
      if (i === 0) {
        if (props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
      } else {
        if (!props.comma)
          onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
        if (props.comment) {
          let prevItemComment = "";
          loop:
            for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
          if (prevItemComment) {
            let prev = coll.items[coll.items.length - 1];
            if (identity.isPair(prev))
              prev = prev.value ?? prev.key;
            if (prev.comment)
              prev.comment += `
` + prevItemComment;
            else
              prev.comment = prevItemComment;
            props.comment = props.comment.substring(prevItemComment.length + 1);
          }
        }
      }
      if (!isMap && !sep3 && !props.found) {
        const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep3, null, props, onError);
        coll.items.push(valueNode);
        offset = valueNode.range[2];
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else {
        ctx.atKey = true;
        const keyStart = props.end;
        const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
        if (isBlock(key))
          onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
        ctx.atKey = false;
        const valueProps = resolveProps.resolveProps(sep3 ?? [], {
          flow: fcName,
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (valueProps.found) {
          if (!isMap && !props.found && ctx.options.strict) {
            if (sep3)
              for (const st of sep3) {
                if (st === valueProps.found)
                  break;
                if (st.type === "newline") {
                  onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                  break;
                }
              }
            if (props.start < valueProps.found.offset - 1024)
              onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
          }
        } else if (value) {
          if ("source" in value && value.source && value.source[0] === ":")
            onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
          else
            onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
        }
        const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep3, null, valueProps, onError) : null;
        if (valueNode) {
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += `
` + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        if (isMap) {
          const map = coll;
          if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
            onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
          map.items.push(pair);
        } else {
          const map = new YAMLMap.YAMLMap(ctx.schema);
          map.flow = true;
          map.items.push(pair);
          const endRange = (valueNode ?? keyNode).range;
          map.range = [keyNode.range[0], endRange[1], endRange[2]];
          coll.items.push(map);
        }
        offset = valueNode ? valueNode.range[2] : valueProps.end;
      }
    }
    const expectedEnd = isMap ? "}" : "]";
    const [ce, ...ee] = fc.end;
    let cePos = offset;
    if (ce && ce.source === expectedEnd)
      cePos = ce.offset + ce.source.length;
    else {
      const name = fcName[0].toUpperCase() + fcName.substring(1);
      const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
      onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
      if (ce && ce.source.length !== 1)
        ee.unshift(ce);
    }
    if (ee.length > 0) {
      const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
      if (end.comment) {
        if (coll.comment)
          coll.comment += `
` + end.comment;
        else
          coll.comment = end.comment;
      }
      coll.range = [fc.offset, cePos, end.offset];
    } else {
      coll.range = [fc.offset, cePos, cePos];
    }
    return coll;
  }
  exports.resolveFlowCollection = resolveFlowCollection;
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var resolveBlockMap = require_resolve_block_map();
  var resolveBlockSeq = require_resolve_block_seq();
  var resolveFlowCollection = require_resolve_flow_collection();
  function resolveCollection(CN, ctx, token, onError, tagName, tag) {
    const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
    const Coll = coll.constructor;
    if (tagName === "!" || tagName === Coll.tagName) {
      coll.tag = Coll.tagName;
      return coll;
    }
    if (tagName)
      coll.tag = tagName;
    return coll;
  }
  function composeCollection(CN, ctx, token, props, onError) {
    const tagToken = props.tag;
    const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
    if (token.type === "block-seq") {
      const { anchor, newlineAfterProp: nl } = props;
      const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
      if (lastProp && (!nl || nl.offset < lastProp.offset)) {
        const message = "Missing newline after block sequence props";
        onError(lastProp, "MISSING_CHAR", message);
      }
    }
    const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
    if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
      return resolveCollection(CN, ctx, token, onError, tagName);
    }
    let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
    if (!tag) {
      const kt = ctx.schema.knownTags[tagName];
      if (kt && kt.collection === expType) {
        ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
        tag = kt;
      } else {
        if (kt) {
          onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
        } else {
          onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
        }
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
    }
    const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
    const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
    const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
    node.range = coll.range;
    node.tag = tagName;
    if (tag?.format)
      node.format = tag.format;
    return node;
  }
  exports.composeCollection = composeCollection;
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS((exports) => {
  var Scalar = require_Scalar();
  function resolveBlockScalar(ctx, scalar, onError) {
    const start = scalar.offset;
    const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
    if (!header)
      return { value: "", type: null, comment: "", range: [start, start, start] };
    const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
    const lines = scalar.source ? splitLines(scalar.source) : [];
    let chompStart = lines.length;
    for (let i = lines.length - 1;i >= 0; --i) {
      const content = lines[i][1];
      if (content === "" || content === "\r")
        chompStart = i;
      else
        break;
    }
    if (chompStart === 0) {
      const value2 = header.chomp === "+" && lines.length > 0 ? `
`.repeat(Math.max(1, lines.length - 1)) : "";
      let end2 = start + header.length;
      if (scalar.source)
        end2 += scalar.source.length;
      return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
    }
    let trimIndent = scalar.indent + header.indent;
    let offset = scalar.offset + header.length;
    let contentStart = 0;
    for (let i = 0;i < chompStart; ++i) {
      const [indent, content] = lines[i];
      if (content === "" || content === "\r") {
        if (header.indent === 0 && indent.length > trimIndent)
          trimIndent = indent.length;
      } else {
        if (indent.length < trimIndent) {
          const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
          onError(offset + indent.length, "MISSING_CHAR", message);
        }
        if (header.indent === 0)
          trimIndent = indent.length;
        contentStart = i;
        if (trimIndent === 0 && !ctx.atRoot) {
          const message = "Block scalar values in collections must be indented";
          onError(offset, "BAD_INDENT", message);
        }
        break;
      }
      offset += indent.length + content.length + 1;
    }
    for (let i = lines.length - 1;i >= chompStart; --i) {
      if (lines[i][0].length > trimIndent)
        chompStart = i + 1;
    }
    let value = "";
    let sep3 = "";
    let prevMoreIndented = false;
    for (let i = 0;i < contentStart; ++i)
      value += lines[i][0].slice(trimIndent) + `
`;
    for (let i = contentStart;i < chompStart; ++i) {
      let [indent, content] = lines[i];
      offset += indent.length + content.length + 1;
      const crlf = content[content.length - 1] === "\r";
      if (crlf)
        content = content.slice(0, -1);
      if (content && indent.length < trimIndent) {
        const src = header.indent ? "explicit indentation indicator" : "first line";
        const message = `Block scalar lines must not be less indented than their ${src}`;
        onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
        indent = "";
      }
      if (type === Scalar.Scalar.BLOCK_LITERAL) {
        value += sep3 + indent.slice(trimIndent) + content;
        sep3 = `
`;
      } else if (indent.length > trimIndent || content[0] === "\t") {
        if (sep3 === " ")
          sep3 = `
`;
        else if (!prevMoreIndented && sep3 === `
`)
          sep3 = `

`;
        value += sep3 + indent.slice(trimIndent) + content;
        sep3 = `
`;
        prevMoreIndented = true;
      } else if (content === "") {
        if (sep3 === `
`)
          value += `
`;
        else
          sep3 = `
`;
      } else {
        value += sep3 + content;
        sep3 = " ";
        prevMoreIndented = false;
      }
    }
    switch (header.chomp) {
      case "-":
        break;
      case "+":
        for (let i = chompStart;i < lines.length; ++i)
          value += `
` + lines[i][0].slice(trimIndent);
        if (value[value.length - 1] !== `
`)
          value += `
`;
        break;
      default:
        value += `
`;
    }
    const end = start + header.length + scalar.source.length;
    return { value, type, comment: header.comment, range: [start, end, end] };
  }
  function parseBlockScalarHeader({ offset, props }, strict, onError) {
    if (props[0].type !== "block-scalar-header") {
      onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
      return null;
    }
    const { source } = props[0];
    const mode = source[0];
    let indent = 0;
    let chomp = "";
    let error = -1;
    for (let i = 1;i < source.length; ++i) {
      const ch = source[i];
      if (!chomp && (ch === "-" || ch === "+"))
        chomp = ch;
      else {
        const n = Number(ch);
        if (!indent && n)
          indent = n;
        else if (error === -1)
          error = offset + i;
      }
    }
    if (error !== -1)
      onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
    let hasSpace = false;
    let comment = "";
    let length = source.length;
    for (let i = 1;i < props.length; ++i) {
      const token = props[i];
      switch (token.type) {
        case "space":
          hasSpace = true;
        case "newline":
          length += token.source.length;
          break;
        case "comment":
          if (strict && !hasSpace) {
            const message = "Comments must be separated from other tokens by white space characters";
            onError(token, "MISSING_CHAR", message);
          }
          length += token.source.length;
          comment = token.source.substring(1);
          break;
        case "error":
          onError(token, "UNEXPECTED_TOKEN", token.message);
          length += token.source.length;
          break;
        default: {
          const message = `Unexpected token in block scalar header: ${token.type}`;
          onError(token, "UNEXPECTED_TOKEN", message);
          const ts = token.source;
          if (ts && typeof ts === "string")
            length += ts.length;
        }
      }
    }
    return { mode, indent, chomp, comment, length };
  }
  function splitLines(source) {
    const split = source.split(/\n( *)/);
    const first = split[0];
    const m = first.match(/^( *)/);
    const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
    const lines = [line0];
    for (let i = 1;i < split.length; i += 2)
      lines.push([split[i], split[i + 1]]);
    return lines;
  }
  exports.resolveBlockScalar = resolveBlockScalar;
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS((exports) => {
  var Scalar = require_Scalar();
  var resolveEnd = require_resolve_end();
  function resolveFlowScalar(scalar, strict, onError) {
    const { offset, type, source, end } = scalar;
    let _type;
    let value;
    const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
    switch (type) {
      case "scalar":
        _type = Scalar.Scalar.PLAIN;
        value = plainValue(source, _onError);
        break;
      case "single-quoted-scalar":
        _type = Scalar.Scalar.QUOTE_SINGLE;
        value = singleQuotedValue(source, _onError);
        break;
      case "double-quoted-scalar":
        _type = Scalar.Scalar.QUOTE_DOUBLE;
        value = doubleQuotedValue(source, _onError);
        break;
      default:
        onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
        return {
          value: "",
          type: null,
          comment: "",
          range: [offset, offset + source.length, offset + source.length]
        };
    }
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
    return {
      value,
      type: _type,
      comment: re.comment,
      range: [offset, valueEnd, re.offset]
    };
  }
  function plainValue(source, onError) {
    let badChar = "";
    switch (source[0]) {
      case "\t":
        badChar = "a tab character";
        break;
      case ",":
        badChar = "flow indicator character ,";
        break;
      case "%":
        badChar = "directive indicator character %";
        break;
      case "|":
      case ">": {
        badChar = `block scalar indicator ${source[0]}`;
        break;
      }
      case "@":
      case "`": {
        badChar = `reserved character ${source[0]}`;
        break;
      }
    }
    if (badChar)
      onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
    return foldLines(source);
  }
  function singleQuotedValue(source, onError) {
    if (source[source.length - 1] !== "'" || source.length === 1)
      onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
    return foldLines(source.slice(1, -1)).replace(/''/g, "'");
  }
  function foldLines(source) {
    let first, line;
    try {
      first = new RegExp(`(.*?)(?<![ 	])[ 	]*\r?
`, "sy");
      line = new RegExp(`[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?
`, "sy");
    } catch {
      first = /(.*?)[ \t]*\r?\n/sy;
      line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
    }
    let match = first.exec(source);
    if (!match)
      return source;
    let res = match[1];
    let sep3 = " ";
    let pos = first.lastIndex;
    line.lastIndex = pos;
    while (match = line.exec(source)) {
      if (match[1] === "") {
        if (sep3 === `
`)
          res += sep3;
        else
          sep3 = `
`;
      } else {
        res += sep3 + match[1];
        sep3 = " ";
      }
      pos = line.lastIndex;
    }
    const last = /[ \t]*(.*)/sy;
    last.lastIndex = pos;
    match = last.exec(source);
    return res + sep3 + (match?.[1] ?? "");
  }
  function doubleQuotedValue(source, onError) {
    let res = "";
    for (let i = 1;i < source.length - 1; ++i) {
      const ch = source[i];
      if (ch === "\r" && source[i + 1] === `
`)
        continue;
      if (ch === `
`) {
        const { fold, offset } = foldNewline(source, i);
        res += fold;
        i = offset;
      } else if (ch === "\\") {
        let next = source[++i];
        const cc = escapeCodes[next];
        if (cc)
          res += cc;
        else if (next === `
`) {
          next = source[i + 1];
          while (next === " " || next === "\t")
            next = source[++i + 1];
        } else if (next === "\r" && source[i + 1] === `
`) {
          next = source[++i + 1];
          while (next === " " || next === "\t")
            next = source[++i + 1];
        } else if (next === "x" || next === "u" || next === "U") {
          const length = { x: 2, u: 4, U: 8 }[next];
          res += parseCharCode(source, i + 1, length, onError);
          i += length;
        } else {
          const raw = source.substr(i - 1, 2);
          onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
          res += raw;
        }
      } else if (ch === " " || ch === "\t") {
        const wsStart = i;
        let next = source[i + 1];
        while (next === " " || next === "\t")
          next = source[++i + 1];
        if (next !== `
` && !(next === "\r" && source[i + 2] === `
`))
          res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
      } else {
        res += ch;
      }
    }
    if (source[source.length - 1] !== '"' || source.length === 1)
      onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
    return res;
  }
  function foldNewline(source, offset) {
    let fold = "";
    let ch = source[offset + 1];
    while (ch === " " || ch === "\t" || ch === `
` || ch === "\r") {
      if (ch === "\r" && source[offset + 2] !== `
`)
        break;
      if (ch === `
`)
        fold += `
`;
      offset += 1;
      ch = source[offset + 1];
    }
    if (!fold)
      fold = " ";
    return { fold, offset };
  }
  var escapeCodes = {
    "0": "\x00",
    a: "\x07",
    b: "\b",
    e: "\x1B",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v",
    N: "",
    _: " ",
    L: "\u2028",
    P: "\u2029",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    "\t": "\t"
  };
  function parseCharCode(source, offset, length, onError) {
    const cc = source.substr(offset, length);
    const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
    const code = ok ? parseInt(cc, 16) : NaN;
    if (isNaN(code)) {
      const raw = source.substr(offset - 2, length + 2);
      onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
      return raw;
    }
    return String.fromCodePoint(code);
  }
  exports.resolveFlowScalar = resolveFlowScalar;
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS((exports) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var resolveBlockScalar = require_resolve_block_scalar();
  var resolveFlowScalar = require_resolve_flow_scalar();
  function composeScalar(ctx, token, tagToken, onError) {
    const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
    const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
    let tag;
    if (ctx.options.stringKeys && ctx.atKey) {
      tag = ctx.schema[identity.SCALAR];
    } else if (tagName)
      tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
    else if (token.type === "scalar")
      tag = findScalarTagByTest(ctx, value, token, onError);
    else
      tag = ctx.schema[identity.SCALAR];
    let scalar;
    try {
      const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
      scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
      scalar = new Scalar.Scalar(value);
    }
    scalar.range = range;
    scalar.source = value;
    if (type)
      scalar.type = type;
    if (tagName)
      scalar.tag = tagName;
    if (tag.format)
      scalar.format = tag.format;
    if (comment)
      scalar.comment = comment;
    return scalar;
  }
  function findScalarTagByName(schema, value, tagName, tagToken, onError) {
    if (tagName === "!")
      return schema[identity.SCALAR];
    const matchWithTest = [];
    for (const tag of schema.tags) {
      if (!tag.collection && tag.tag === tagName) {
        if (tag.default && tag.test)
          matchWithTest.push(tag);
        else
          return tag;
      }
    }
    for (const tag of matchWithTest)
      if (tag.test?.test(value))
        return tag;
    const kt = schema.knownTags[tagName];
    if (kt && !kt.collection) {
      schema.tags.push(Object.assign({}, kt, { default: false, test: undefined }));
      return kt;
    }
    onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
    return schema[identity.SCALAR];
  }
  function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
    const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
    if (schema.compat) {
      const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
      if (tag.tag !== compat.tag) {
        const ts = directives.tagString(tag.tag);
        const cs = directives.tagString(compat.tag);
        const msg = `Value may be parsed as either ${ts} or ${cs}`;
        onError(token, "TAG_RESOLVE_FAILED", msg, true);
      }
    }
    return tag;
  }
  exports.composeScalar = composeScalar;
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS((exports) => {
  function emptyScalarPosition(offset, before, pos) {
    if (before) {
      pos ?? (pos = before.length);
      for (let i = pos - 1;i >= 0; --i) {
        let st = before[i];
        switch (st.type) {
          case "space":
          case "comment":
          case "newline":
            offset -= st.source.length;
            continue;
        }
        st = before[++i];
        while (st?.type === "space") {
          offset += st.source.length;
          st = before[++i];
        }
        break;
      }
    }
    return offset;
  }
  exports.emptyScalarPosition = emptyScalarPosition;
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS((exports) => {
  var Alias = require_Alias();
  var identity = require_identity();
  var composeCollection = require_compose_collection();
  var composeScalar = require_compose_scalar();
  var resolveEnd = require_resolve_end();
  var utilEmptyScalarPosition = require_util_empty_scalar_position();
  var CN = { composeNode, composeEmptyNode };
  function composeNode(ctx, token, props, onError) {
    const atKey = ctx.atKey;
    const { spaceBefore, comment, anchor, tag } = props;
    let node;
    let isSrcToken = true;
    switch (token.type) {
      case "alias":
        node = composeAlias(ctx, token, onError);
        if (anchor || tag)
          onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
        break;
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "block-scalar":
        node = composeScalar.composeScalar(ctx, token, tag, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
        break;
      case "block-map":
      case "block-seq":
      case "flow-collection":
        node = composeCollection.composeCollection(CN, ctx, token, props, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
        break;
      default: {
        const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
        onError(token, "UNEXPECTED_TOKEN", message);
        node = composeEmptyNode(ctx, token.offset, undefined, null, props, onError);
        isSrcToken = false;
      }
    }
    if (anchor && node.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
      const msg = "With stringKeys, all keys must be strings";
      onError(tag ?? token, "NON_STRING_KEY", msg);
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      if (token.type === "scalar" && token.source === "")
        node.comment = comment;
      else
        node.commentBefore = comment;
    }
    if (ctx.options.keepSourceTokens && isSrcToken)
      node.srcToken = token;
    return node;
  }
  function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
    const token = {
      type: "scalar",
      offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
      indent: -1,
      source: ""
    };
    const node = composeScalar.composeScalar(ctx, token, tag, onError);
    if (anchor) {
      node.anchor = anchor.source.substring(1);
      if (node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      node.comment = comment;
      node.range[2] = end;
    }
    return node;
  }
  function composeAlias({ options }, { offset, source, end }, onError) {
    const alias = new Alias.Alias(source.substring(1));
    if (alias.source === "")
      onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
    if (alias.source.endsWith(":"))
      onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
    alias.range = [offset, valueEnd, re.offset];
    if (re.comment)
      alias.comment = re.comment;
    return alias;
  }
  exports.composeEmptyNode = composeEmptyNode;
  exports.composeNode = composeNode;
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS((exports) => {
  var Document = require_Document();
  var composeNode = require_compose_node();
  var resolveEnd = require_resolve_end();
  var resolveProps = require_resolve_props();
  function composeDoc(options, directives, { offset, start, value, end }, onError) {
    const opts = Object.assign({ _directives: directives }, options);
    const doc = new Document.Document(undefined, opts);
    const ctx = {
      atKey: false,
      atRoot: true,
      directives: doc.directives,
      options: doc.options,
      schema: doc.schema
    };
    const props = resolveProps.resolveProps(start, {
      indicator: "doc-start",
      next: value ?? end?.[0],
      offset,
      onError,
      parentIndent: 0,
      startOnNewline: true
    });
    if (props.found) {
      doc.directives.docStart = true;
      if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
        onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
    }
    doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
    const contentEnd = doc.contents.range[2];
    const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
    if (re.comment)
      doc.comment = re.comment;
    doc.range = [offset, contentEnd, re.offset];
    return doc;
  }
  exports.composeDoc = composeDoc;
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS((exports) => {
  var node_process = __require("process");
  var directives = require_directives();
  var Document = require_Document();
  var errors = require_errors();
  var identity = require_identity();
  var composeDoc = require_compose_doc();
  var resolveEnd = require_resolve_end();
  function getErrorPos(src) {
    if (typeof src === "number")
      return [src, src + 1];
    if (Array.isArray(src))
      return src.length === 2 ? src : [src[0], src[1]];
    const { offset, source } = src;
    return [offset, offset + (typeof source === "string" ? source.length : 1)];
  }
  function parsePrelude(prelude) {
    let comment = "";
    let atComment = false;
    let afterEmptyLine = false;
    for (let i = 0;i < prelude.length; ++i) {
      const source = prelude[i];
      switch (source[0]) {
        case "#":
          comment += (comment === "" ? "" : afterEmptyLine ? `

` : `
`) + (source.substring(1) || " ");
          atComment = true;
          afterEmptyLine = false;
          break;
        case "%":
          if (prelude[i + 1]?.[0] !== "#")
            i += 1;
          atComment = false;
          break;
        default:
          if (!atComment)
            afterEmptyLine = true;
          atComment = false;
      }
    }
    return { comment, afterEmptyLine };
  }

  class Composer {
    constructor(options = {}) {
      this.doc = null;
      this.atDirectives = false;
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
      this.onError = (source, code, message, warning) => {
        const pos = getErrorPos(source);
        if (warning)
          this.warnings.push(new errors.YAMLWarning(pos, code, message));
        else
          this.errors.push(new errors.YAMLParseError(pos, code, message));
      };
      this.directives = new directives.Directives({ version: options.version || "1.2" });
      this.options = options;
    }
    decorate(doc, afterDoc) {
      const { comment, afterEmptyLine } = parsePrelude(this.prelude);
      if (comment) {
        const dc = doc.contents;
        if (afterDoc) {
          doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
        } else if (afterEmptyLine || doc.directives.docStart || !dc) {
          doc.commentBefore = comment;
        } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
          let it = dc.items[0];
          if (identity.isPair(it))
            it = it.key;
          const cb = it.commentBefore;
          it.commentBefore = cb ? `${comment}
${cb}` : comment;
        } else {
          const cb = dc.commentBefore;
          dc.commentBefore = cb ? `${comment}
${cb}` : comment;
        }
      }
      if (afterDoc) {
        Array.prototype.push.apply(doc.errors, this.errors);
        Array.prototype.push.apply(doc.warnings, this.warnings);
      } else {
        doc.errors = this.errors;
        doc.warnings = this.warnings;
      }
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
    }
    streamInfo() {
      return {
        comment: parsePrelude(this.prelude).comment,
        directives: this.directives,
        errors: this.errors,
        warnings: this.warnings
      };
    }
    *compose(tokens, forceDoc = false, endOffset = -1) {
      for (const token of tokens)
        yield* this.next(token);
      yield* this.end(forceDoc, endOffset);
    }
    *next(token) {
      if (node_process.env.LOG_STREAM)
        console.dir(token, { depth: null });
      switch (token.type) {
        case "directive":
          this.directives.add(token.source, (offset, message, warning) => {
            const pos = getErrorPos(token);
            pos[0] += offset;
            this.onError(pos, "BAD_DIRECTIVE", message, warning);
          });
          this.prelude.push(token.source);
          this.atDirectives = true;
          break;
        case "document": {
          const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
          if (this.atDirectives && !doc.directives.docStart)
            this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
          this.decorate(doc, false);
          if (this.doc)
            yield this.doc;
          this.doc = doc;
          this.atDirectives = false;
          break;
        }
        case "byte-order-mark":
        case "space":
          break;
        case "comment":
        case "newline":
          this.prelude.push(token.source);
          break;
        case "error": {
          const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
          const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
          if (this.atDirectives || !this.doc)
            this.errors.push(error);
          else
            this.doc.errors.push(error);
          break;
        }
        case "doc-end": {
          if (!this.doc) {
            const msg = "Unexpected doc-end without preceding document";
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
            break;
          }
          this.doc.directives.docEnd = true;
          const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
          this.decorate(this.doc, true);
          if (end.comment) {
            const dc = this.doc.comment;
            this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
          }
          this.doc.range[2] = end.offset;
          break;
        }
        default:
          this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
      }
    }
    *end(forceDoc = false, endOffset = -1) {
      if (this.doc) {
        this.decorate(this.doc, true);
        yield this.doc;
        this.doc = null;
      } else if (forceDoc) {
        const opts = Object.assign({ _directives: this.directives }, this.options);
        const doc = new Document.Document(undefined, opts);
        if (this.atDirectives)
          this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
        doc.range = [0, endOffset, endOffset];
        this.decorate(doc, false);
        yield doc;
      }
    }
  }
  exports.Composer = Composer;
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS((exports) => {
  var resolveBlockScalar = require_resolve_block_scalar();
  var resolveFlowScalar = require_resolve_flow_scalar();
  var errors = require_errors();
  var stringifyString = require_stringifyString();
  function resolveAsScalar(token, strict = true, onError) {
    if (token) {
      const _onError = (pos, code, message) => {
        const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
        if (onError)
          onError(offset, code, message);
        else
          throw new errors.YAMLParseError([offset, offset + 1], code, message);
      };
      switch (token.type) {
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
        case "block-scalar":
          return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
      }
    }
    return null;
  }
  function createScalarToken(value, context) {
    const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
    const source = stringifyString.stringifyString({ type, value }, {
      implicitKey,
      indent: indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    const end = context.end ?? [
      { type: "newline", offset: -1, indent, source: `
` }
    ];
    switch (source[0]) {
      case "|":
      case ">": {
        const he = source.indexOf(`
`);
        const head = source.substring(0, he);
        const body = source.substring(he + 1) + `
`;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, end))
          props.push({ type: "newline", offset: -1, indent, source: `
` });
        return { type: "block-scalar", offset, indent, props, source: body };
      }
      case '"':
        return { type: "double-quoted-scalar", offset, indent, source, end };
      case "'":
        return { type: "single-quoted-scalar", offset, indent, source, end };
      default:
        return { type: "scalar", offset, indent, source, end };
    }
  }
  function setScalarValue(token, value, context = {}) {
    let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
    let indent = "indent" in token ? token.indent : null;
    if (afterKey && typeof indent === "number")
      indent += 2;
    if (!type)
      switch (token.type) {
        case "single-quoted-scalar":
          type = "QUOTE_SINGLE";
          break;
        case "double-quoted-scalar":
          type = "QUOTE_DOUBLE";
          break;
        case "block-scalar": {
          const header = token.props[0];
          if (header.type !== "block-scalar-header")
            throw new Error("Invalid block scalar header");
          type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
          break;
        }
        default:
          type = "PLAIN";
      }
    const source = stringifyString.stringifyString({ type, value }, {
      implicitKey: implicitKey || indent === null,
      indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    switch (source[0]) {
      case "|":
      case ">":
        setBlockScalarValue(token, source);
        break;
      case '"':
        setFlowScalarValue(token, source, "double-quoted-scalar");
        break;
      case "'":
        setFlowScalarValue(token, source, "single-quoted-scalar");
        break;
      default:
        setFlowScalarValue(token, source, "scalar");
    }
  }
  function setBlockScalarValue(token, source) {
    const he = source.indexOf(`
`);
    const head = source.substring(0, he);
    const body = source.substring(he + 1) + `
`;
    if (token.type === "block-scalar") {
      const header = token.props[0];
      if (header.type !== "block-scalar-header")
        throw new Error("Invalid block scalar header");
      header.source = head;
      token.source = body;
    } else {
      const { offset } = token;
      const indent = "indent" in token ? token.indent : -1;
      const props = [
        { type: "block-scalar-header", offset, indent, source: head }
      ];
      if (!addEndtoBlockProps(props, "end" in token ? token.end : undefined))
        props.push({ type: "newline", offset: -1, indent, source: `
` });
      for (const key of Object.keys(token))
        if (key !== "type" && key !== "offset")
          delete token[key];
      Object.assign(token, { type: "block-scalar", indent, props, source: body });
    }
  }
  function addEndtoBlockProps(props, end) {
    if (end)
      for (const st of end)
        switch (st.type) {
          case "space":
          case "comment":
            props.push(st);
            break;
          case "newline":
            props.push(st);
            return true;
        }
    return false;
  }
  function setFlowScalarValue(token, source, type) {
    switch (token.type) {
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        token.type = type;
        token.source = source;
        break;
      case "block-scalar": {
        const end = token.props.slice(1);
        let oa = source.length;
        if (token.props[0].type === "block-scalar-header")
          oa -= token.props[0].source.length;
        for (const tok of end)
          tok.offset += oa;
        delete token.props;
        Object.assign(token, { type, source, end });
        break;
      }
      case "block-map":
      case "block-seq": {
        const offset = token.offset + source.length;
        const nl = { type: "newline", offset, indent: token.indent, source: `
` };
        delete token.items;
        Object.assign(token, { type, source, end: [nl] });
        break;
      }
      default: {
        const indent = "indent" in token ? token.indent : -1;
        const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type, indent, source, end });
      }
    }
  }
  exports.createScalarToken = createScalarToken;
  exports.resolveAsScalar = resolveAsScalar;
  exports.setScalarValue = setScalarValue;
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS((exports) => {
  var stringify2 = (cst) => ("type" in cst) ? stringifyToken(cst) : stringifyItem(cst);
  function stringifyToken(token) {
    switch (token.type) {
      case "block-scalar": {
        let res = "";
        for (const tok of token.props)
          res += stringifyToken(tok);
        return res + token.source;
      }
      case "block-map":
      case "block-seq": {
        let res = "";
        for (const item of token.items)
          res += stringifyItem(item);
        return res;
      }
      case "flow-collection": {
        let res = token.start.source;
        for (const item of token.items)
          res += stringifyItem(item);
        for (const st of token.end)
          res += st.source;
        return res;
      }
      case "document": {
        let res = stringifyItem(token);
        if (token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
      default: {
        let res = token.source;
        if ("end" in token && token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
    }
  }
  function stringifyItem({ start, key, sep: sep3, value }) {
    let res = "";
    for (const st of start)
      res += st.source;
    if (key)
      res += stringifyToken(key);
    if (sep3)
      for (const st of sep3)
        res += st.source;
    if (value)
      res += stringifyToken(value);
    return res;
  }
  exports.stringify = stringify2;
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS((exports) => {
  var BREAK = Symbol("break visit");
  var SKIP2 = Symbol("skip children");
  var REMOVE = Symbol("remove item");
  function visit(cst, visitor) {
    if ("type" in cst && cst.type === "document")
      cst = { start: cst.start, value: cst.value };
    _visit(Object.freeze([]), cst, visitor);
  }
  visit.BREAK = BREAK;
  visit.SKIP = SKIP2;
  visit.REMOVE = REMOVE;
  visit.itemAtPath = (cst, path13) => {
    let item = cst;
    for (const [field, index] of path13) {
      const tok = item?.[field];
      if (tok && "items" in tok) {
        item = tok.items[index];
      } else
        return;
    }
    return item;
  };
  visit.parentCollection = (cst, path13) => {
    const parent = visit.itemAtPath(cst, path13.slice(0, -1));
    const field = path13[path13.length - 1][0];
    const coll = parent?.[field];
    if (coll && "items" in coll)
      return coll;
    throw new Error("Parent collection not found");
  };
  function _visit(path13, item, visitor) {
    let ctrl = visitor(item, path13);
    if (typeof ctrl === "symbol")
      return ctrl;
    for (const field of ["key", "value"]) {
      const token = item[field];
      if (token && "items" in token) {
        for (let i = 0;i < token.items.length; ++i) {
          const ci = _visit(Object.freeze(path13.concat([[field, i]])), token.items[i], visitor);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            token.items.splice(i, 1);
            i -= 1;
          }
        }
        if (typeof ctrl === "function" && field === "key")
          ctrl = ctrl(item, path13);
      }
    }
    return typeof ctrl === "function" ? ctrl(item, path13) : ctrl;
  }
  exports.visit = visit;
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS((exports) => {
  var cstScalar = require_cst_scalar();
  var cstStringify = require_cst_stringify();
  var cstVisit = require_cst_visit();
  var BOM = "\uFEFF";
  var DOCUMENT = "\x02";
  var FLOW_END = "\x18";
  var SCALAR = "\x1F";
  var isCollection = (token) => !!token && ("items" in token);
  var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
  function prettyToken(token) {
    switch (token) {
      case BOM:
        return "<BOM>";
      case DOCUMENT:
        return "<DOC>";
      case FLOW_END:
        return "<FLOW_END>";
      case SCALAR:
        return "<SCALAR>";
      default:
        return JSON.stringify(token);
    }
  }
  function tokenType(source) {
    switch (source) {
      case BOM:
        return "byte-order-mark";
      case DOCUMENT:
        return "doc-mode";
      case FLOW_END:
        return "flow-error-end";
      case SCALAR:
        return "scalar";
      case "---":
        return "doc-start";
      case "...":
        return "doc-end";
      case "":
      case `
`:
      case `\r
`:
        return "newline";
      case "-":
        return "seq-item-ind";
      case "?":
        return "explicit-key-ind";
      case ":":
        return "map-value-ind";
      case "{":
        return "flow-map-start";
      case "}":
        return "flow-map-end";
      case "[":
        return "flow-seq-start";
      case "]":
        return "flow-seq-end";
      case ",":
        return "comma";
    }
    switch (source[0]) {
      case " ":
      case "\t":
        return "space";
      case "#":
        return "comment";
      case "%":
        return "directive-line";
      case "*":
        return "alias";
      case "&":
        return "anchor";
      case "!":
        return "tag";
      case "'":
        return "single-quoted-scalar";
      case '"':
        return "double-quoted-scalar";
      case "|":
      case ">":
        return "block-scalar-header";
    }
    return null;
  }
  exports.createScalarToken = cstScalar.createScalarToken;
  exports.resolveAsScalar = cstScalar.resolveAsScalar;
  exports.setScalarValue = cstScalar.setScalarValue;
  exports.stringify = cstStringify.stringify;
  exports.visit = cstVisit.visit;
  exports.BOM = BOM;
  exports.DOCUMENT = DOCUMENT;
  exports.FLOW_END = FLOW_END;
  exports.SCALAR = SCALAR;
  exports.isCollection = isCollection;
  exports.isScalar = isScalar;
  exports.prettyToken = prettyToken;
  exports.tokenType = tokenType;
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS((exports) => {
  var cst = require_cst();
  function isEmpty(ch) {
    switch (ch) {
      case undefined:
      case " ":
      case `
`:
      case "\r":
      case "\t":
        return true;
      default:
        return false;
    }
  }
  var hexDigits = new Set("0123456789ABCDEFabcdef");
  var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
  var flowIndicatorChars = new Set(",[]{}");
  var invalidAnchorChars = new Set(` ,[]{}
\r	`);
  var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);

  class Lexer {
    constructor() {
      this.atEnd = false;
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      this.buffer = "";
      this.flowKey = false;
      this.flowLevel = 0;
      this.indentNext = 0;
      this.indentValue = 0;
      this.lineEndPos = null;
      this.next = null;
      this.pos = 0;
    }
    *lex(source, incomplete = false) {
      if (source) {
        if (typeof source !== "string")
          throw TypeError("source is not a string");
        this.buffer = this.buffer ? this.buffer + source : source;
        this.lineEndPos = null;
      }
      this.atEnd = !incomplete;
      let next = this.next ?? "stream";
      while (next && (incomplete || this.hasChars(1)))
        next = yield* this.parseNext(next);
    }
    atLineEnd() {
      let i = this.pos;
      let ch = this.buffer[i];
      while (ch === " " || ch === "\t")
        ch = this.buffer[++i];
      if (!ch || ch === "#" || ch === `
`)
        return true;
      if (ch === "\r")
        return this.buffer[i + 1] === `
`;
      return false;
    }
    charAt(n) {
      return this.buffer[this.pos + n];
    }
    continueScalar(offset) {
      let ch = this.buffer[offset];
      if (this.indentNext > 0) {
        let indent = 0;
        while (ch === " ")
          ch = this.buffer[++indent + offset];
        if (ch === "\r") {
          const next = this.buffer[indent + offset + 1];
          if (next === `
` || !next && !this.atEnd)
            return offset + indent + 1;
        }
        return ch === `
` || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
      }
      if (ch === "-" || ch === ".") {
        const dt = this.buffer.substr(offset, 3);
        if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
          return -1;
      }
      return offset;
    }
    getLine() {
      let end = this.lineEndPos;
      if (typeof end !== "number" || end !== -1 && end < this.pos) {
        end = this.buffer.indexOf(`
`, this.pos);
        this.lineEndPos = end;
      }
      if (end === -1)
        return this.atEnd ? this.buffer.substring(this.pos) : null;
      if (this.buffer[end - 1] === "\r")
        end -= 1;
      return this.buffer.substring(this.pos, end);
    }
    hasChars(n) {
      return this.pos + n <= this.buffer.length;
    }
    setNext(state) {
      this.buffer = this.buffer.substring(this.pos);
      this.pos = 0;
      this.lineEndPos = null;
      this.next = state;
      return null;
    }
    peek(n) {
      return this.buffer.substr(this.pos, n);
    }
    *parseNext(next) {
      switch (next) {
        case "stream":
          return yield* this.parseStream();
        case "line-start":
          return yield* this.parseLineStart();
        case "block-start":
          return yield* this.parseBlockStart();
        case "doc":
          return yield* this.parseDocument();
        case "flow":
          return yield* this.parseFlowCollection();
        case "quoted-scalar":
          return yield* this.parseQuotedScalar();
        case "block-scalar":
          return yield* this.parseBlockScalar();
        case "plain-scalar":
          return yield* this.parsePlainScalar();
      }
    }
    *parseStream() {
      let line = this.getLine();
      if (line === null)
        return this.setNext("stream");
      if (line[0] === cst.BOM) {
        yield* this.pushCount(1);
        line = line.substring(1);
      }
      if (line[0] === "%") {
        let dirEnd = line.length;
        let cs = line.indexOf("#");
        while (cs !== -1) {
          const ch = line[cs - 1];
          if (ch === " " || ch === "\t") {
            dirEnd = cs - 1;
            break;
          } else {
            cs = line.indexOf("#", cs + 1);
          }
        }
        while (true) {
          const ch = line[dirEnd - 1];
          if (ch === " " || ch === "\t")
            dirEnd -= 1;
          else
            break;
        }
        const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
        yield* this.pushCount(line.length - n);
        this.pushNewline();
        return "stream";
      }
      if (this.atLineEnd()) {
        const sp = yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - sp);
        yield* this.pushNewline();
        return "stream";
      }
      yield cst.DOCUMENT;
      return yield* this.parseLineStart();
    }
    *parseLineStart() {
      const ch = this.charAt(0);
      if (!ch && !this.atEnd)
        return this.setNext("line-start");
      if (ch === "-" || ch === ".") {
        if (!this.atEnd && !this.hasChars(4))
          return this.setNext("line-start");
        const s = this.peek(3);
        if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
          yield* this.pushCount(3);
          this.indentValue = 0;
          this.indentNext = 0;
          return s === "---" ? "doc" : "stream";
        }
      }
      this.indentValue = yield* this.pushSpaces(false);
      if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
        this.indentNext = this.indentValue;
      return yield* this.parseBlockStart();
    }
    *parseBlockStart() {
      const [ch0, ch1] = this.peek(2);
      if (!ch1 && !this.atEnd)
        return this.setNext("block-start");
      if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
        const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
        this.indentNext = this.indentValue + 1;
        this.indentValue += n;
        return yield* this.parseBlockStart();
      }
      return "doc";
    }
    *parseDocument() {
      yield* this.pushSpaces(true);
      const line = this.getLine();
      if (line === null)
        return this.setNext("doc");
      let n = yield* this.pushIndicators();
      switch (line[n]) {
        case "#":
          yield* this.pushCount(line.length - n);
        case undefined:
          yield* this.pushNewline();
          return yield* this.parseLineStart();
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel = 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          return "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "doc";
        case '"':
        case "'":
          return yield* this.parseQuotedScalar();
        case "|":
        case ">":
          n += yield* this.parseBlockScalarHeader();
          n += yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - n);
          yield* this.pushNewline();
          return yield* this.parseBlockScalar();
        default:
          return yield* this.parsePlainScalar();
      }
    }
    *parseFlowCollection() {
      let nl, sp;
      let indent = -1;
      do {
        nl = yield* this.pushNewline();
        if (nl > 0) {
          sp = yield* this.pushSpaces(false);
          this.indentValue = indent = sp;
        } else {
          sp = 0;
        }
        sp += yield* this.pushSpaces(true);
      } while (nl + sp > 0);
      const line = this.getLine();
      if (line === null)
        return this.setNext("flow");
      if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
        const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
        if (!atFlowEndMarker) {
          this.flowLevel = 0;
          yield cst.FLOW_END;
          return yield* this.parseLineStart();
        }
      }
      let n = 0;
      while (line[n] === ",") {
        n += yield* this.pushCount(1);
        n += yield* this.pushSpaces(true);
        this.flowKey = false;
      }
      n += yield* this.pushIndicators();
      switch (line[n]) {
        case undefined:
          return "flow";
        case "#":
          yield* this.pushCount(line.length - n);
          return "flow";
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel += 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          this.flowKey = true;
          this.flowLevel -= 1;
          return this.flowLevel ? "flow" : "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "flow";
        case '"':
        case "'":
          this.flowKey = true;
          return yield* this.parseQuotedScalar();
        case ":": {
          const next = this.charAt(1);
          if (this.flowKey || isEmpty(next) || next === ",") {
            this.flowKey = false;
            yield* this.pushCount(1);
            yield* this.pushSpaces(true);
            return "flow";
          }
        }
        default:
          this.flowKey = false;
          return yield* this.parsePlainScalar();
      }
    }
    *parseQuotedScalar() {
      const quote = this.charAt(0);
      let end = this.buffer.indexOf(quote, this.pos + 1);
      if (quote === "'") {
        while (end !== -1 && this.buffer[end + 1] === "'")
          end = this.buffer.indexOf("'", end + 2);
      } else {
        while (end !== -1) {
          let n = 0;
          while (this.buffer[end - 1 - n] === "\\")
            n += 1;
          if (n % 2 === 0)
            break;
          end = this.buffer.indexOf('"', end + 1);
        }
      }
      const qb = this.buffer.substring(0, end);
      let nl = qb.indexOf(`
`, this.pos);
      if (nl !== -1) {
        while (nl !== -1) {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = qb.indexOf(`
`, cs);
        }
        if (nl !== -1) {
          end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
        }
      }
      if (end === -1) {
        if (!this.atEnd)
          return this.setNext("quoted-scalar");
        end = this.buffer.length;
      }
      yield* this.pushToIndex(end + 1, false);
      return this.flowLevel ? "flow" : "doc";
    }
    *parseBlockScalarHeader() {
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      let i = this.pos;
      while (true) {
        const ch = this.buffer[++i];
        if (ch === "+")
          this.blockScalarKeep = true;
        else if (ch > "0" && ch <= "9")
          this.blockScalarIndent = Number(ch) - 1;
        else if (ch !== "-")
          break;
      }
      return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
    }
    *parseBlockScalar() {
      let nl = this.pos - 1;
      let indent = 0;
      let ch;
      loop:
        for (let i2 = this.pos;ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case `
`:
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === `
`)
                break;
            }
            default:
              break loop;
          }
        }
      if (!ch && !this.atEnd)
        return this.setNext("block-scalar");
      if (indent >= this.indentNext) {
        if (this.blockScalarIndent === -1)
          this.indentNext = indent;
        else {
          this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
        }
        do {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = this.buffer.indexOf(`
`, cs);
        } while (nl !== -1);
        if (nl === -1) {
          if (!this.atEnd)
            return this.setNext("block-scalar");
          nl = this.buffer.length;
        }
      }
      let i = nl + 1;
      ch = this.buffer[i];
      while (ch === " ")
        ch = this.buffer[++i];
      if (ch === "\t") {
        while (ch === "\t" || ch === " " || ch === "\r" || ch === `
`)
          ch = this.buffer[++i];
        nl = i - 1;
      } else if (!this.blockScalarKeep) {
        do {
          let i2 = nl - 1;
          let ch2 = this.buffer[i2];
          if (ch2 === "\r")
            ch2 = this.buffer[--i2];
          const lastChar = i2;
          while (ch2 === " ")
            ch2 = this.buffer[--i2];
          if (ch2 === `
` && i2 >= this.pos && i2 + 1 + indent > lastChar)
            nl = i2;
          else
            break;
        } while (true);
      }
      yield cst.SCALAR;
      yield* this.pushToIndex(nl + 1, true);
      return yield* this.parseLineStart();
    }
    *parsePlainScalar() {
      const inFlow = this.flowLevel > 0;
      let end = this.pos - 1;
      let i = this.pos - 1;
      let ch;
      while (ch = this.buffer[++i]) {
        if (ch === ":") {
          const next = this.buffer[i + 1];
          if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
            break;
          end = i;
        } else if (isEmpty(ch)) {
          let next = this.buffer[i + 1];
          if (ch === "\r") {
            if (next === `
`) {
              i += 1;
              ch = `
`;
              next = this.buffer[i + 1];
            } else
              end = i;
          }
          if (next === "#" || inFlow && flowIndicatorChars.has(next))
            break;
          if (ch === `
`) {
            const cs = this.continueScalar(i + 1);
            if (cs === -1)
              break;
            i = Math.max(i, cs - 2);
          }
        } else {
          if (inFlow && flowIndicatorChars.has(ch))
            break;
          end = i;
        }
      }
      if (!ch && !this.atEnd)
        return this.setNext("plain-scalar");
      yield cst.SCALAR;
      yield* this.pushToIndex(end + 1, true);
      return inFlow ? "flow" : "doc";
    }
    *pushCount(n) {
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos += n;
        return n;
      }
      return 0;
    }
    *pushToIndex(i, allowEmpty) {
      const s = this.buffer.slice(this.pos, i);
      if (s) {
        yield s;
        this.pos += s.length;
        return s.length;
      } else if (allowEmpty)
        yield "";
      return 0;
    }
    *pushIndicators() {
      switch (this.charAt(0)) {
        case "!":
          return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
        case "&":
          return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
        case "-":
        case "?":
        case ":": {
          const inFlow = this.flowLevel > 0;
          const ch1 = this.charAt(1);
          if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
            if (!inFlow)
              this.indentNext = this.indentValue + 1;
            else if (this.flowKey)
              this.flowKey = false;
            return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          }
        }
      }
      return 0;
    }
    *pushTag() {
      if (this.charAt(1) === "<") {
        let i = this.pos + 2;
        let ch = this.buffer[i];
        while (!isEmpty(ch) && ch !== ">")
          ch = this.buffer[++i];
        return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
      } else {
        let i = this.pos + 1;
        let ch = this.buffer[i];
        while (ch) {
          if (tagChars.has(ch))
            ch = this.buffer[++i];
          else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
            ch = this.buffer[i += 3];
          } else
            break;
        }
        return yield* this.pushToIndex(i, false);
      }
    }
    *pushNewline() {
      const ch = this.buffer[this.pos];
      if (ch === `
`)
        return yield* this.pushCount(1);
      else if (ch === "\r" && this.charAt(1) === `
`)
        return yield* this.pushCount(2);
      else
        return 0;
    }
    *pushSpaces(allowTabs) {
      let i = this.pos - 1;
      let ch;
      do {
        ch = this.buffer[++i];
      } while (ch === " " || allowTabs && ch === "\t");
      const n = i - this.pos;
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos = i;
      }
      return n;
    }
    *pushUntil(test) {
      let i = this.pos;
      let ch = this.buffer[i];
      while (!test(ch))
        ch = this.buffer[++i];
      return yield* this.pushToIndex(i, false);
    }
  }
  exports.Lexer = Lexer;
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS((exports) => {
  class LineCounter {
    constructor() {
      this.lineStarts = [];
      this.addNewLine = (offset) => this.lineStarts.push(offset);
      this.linePos = (offset) => {
        let low = 0;
        let high = this.lineStarts.length;
        while (low < high) {
          const mid = low + high >> 1;
          if (this.lineStarts[mid] < offset)
            low = mid + 1;
          else
            high = mid;
        }
        if (this.lineStarts[low] === offset)
          return { line: low + 1, col: 1 };
        if (low === 0)
          return { line: 0, col: offset };
        const start = this.lineStarts[low - 1];
        return { line: low, col: offset - start + 1 };
      };
    }
  }
  exports.LineCounter = LineCounter;
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS((exports) => {
  var node_process = __require("process");
  var cst = require_cst();
  var lexer = require_lexer();
  function includesToken(list, type) {
    for (let i = 0;i < list.length; ++i)
      if (list[i].type === type)
        return true;
    return false;
  }
  function findNonEmptyIndex(list) {
    for (let i = 0;i < list.length; ++i) {
      switch (list[i].type) {
        case "space":
        case "comment":
        case "newline":
          break;
        default:
          return i;
      }
    }
    return -1;
  }
  function isFlowToken(token) {
    switch (token?.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "flow-collection":
        return true;
      default:
        return false;
    }
  }
  function getPrevProps(parent) {
    switch (parent.type) {
      case "document":
        return parent.start;
      case "block-map": {
        const it = parent.items[parent.items.length - 1];
        return it.sep ?? it.start;
      }
      case "block-seq":
        return parent.items[parent.items.length - 1].start;
      default:
        return [];
    }
  }
  function getFirstKeyStartProps(prev) {
    if (prev.length === 0)
      return [];
    let i = prev.length;
    loop:
      while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
    while (prev[++i]?.type === "space") {}
    return prev.splice(i, prev.length);
  }
  function fixFlowSeqItems(fc) {
    if (fc.start.type === "flow-seq-start") {
      for (const it of fc.items) {
        if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
          if (it.key)
            it.value = it.key;
          delete it.key;
          if (isFlowToken(it.value)) {
            if (it.value.end)
              Array.prototype.push.apply(it.value.end, it.sep);
            else
              it.value.end = it.sep;
          } else
            Array.prototype.push.apply(it.start, it.sep);
          delete it.sep;
        }
      }
    }
  }

  class Parser {
    constructor(onNewLine) {
      this.atNewLine = true;
      this.atScalar = false;
      this.indent = 0;
      this.offset = 0;
      this.onKeyLine = false;
      this.stack = [];
      this.source = "";
      this.type = "";
      this.lexer = new lexer.Lexer;
      this.onNewLine = onNewLine;
    }
    *parse(source, incomplete = false) {
      if (this.onNewLine && this.offset === 0)
        this.onNewLine(0);
      for (const lexeme of this.lexer.lex(source, incomplete))
        yield* this.next(lexeme);
      if (!incomplete)
        yield* this.end();
    }
    *next(source) {
      this.source = source;
      if (node_process.env.LOG_TOKENS)
        console.log("|", cst.prettyToken(source));
      if (this.atScalar) {
        this.atScalar = false;
        yield* this.step();
        this.offset += source.length;
        return;
      }
      const type = cst.tokenType(source);
      if (!type) {
        const message = `Not a YAML token: ${source}`;
        yield* this.pop({ type: "error", offset: this.offset, message, source });
        this.offset += source.length;
      } else if (type === "scalar") {
        this.atNewLine = false;
        this.atScalar = true;
        this.type = "scalar";
      } else {
        this.type = type;
        yield* this.step();
        switch (type) {
          case "newline":
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine)
              this.onNewLine(this.offset + source.length);
            break;
          case "space":
            if (this.atNewLine && source[0] === " ")
              this.indent += source.length;
            break;
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
            if (this.atNewLine)
              this.indent += source.length;
            break;
          case "doc-mode":
          case "flow-error-end":
            return;
          default:
            this.atNewLine = false;
        }
        this.offset += source.length;
      }
    }
    *end() {
      while (this.stack.length > 0)
        yield* this.pop();
    }
    get sourceToken() {
      const st = {
        type: this.type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
      return st;
    }
    *step() {
      const top = this.peek(1);
      if (this.type === "doc-end" && (!top || top.type !== "doc-end")) {
        while (this.stack.length > 0)
          yield* this.pop();
        this.stack.push({
          type: "doc-end",
          offset: this.offset,
          source: this.source
        });
        return;
      }
      if (!top)
        return yield* this.stream();
      switch (top.type) {
        case "document":
          return yield* this.document(top);
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return yield* this.scalar(top);
        case "block-scalar":
          return yield* this.blockScalar(top);
        case "block-map":
          return yield* this.blockMap(top);
        case "block-seq":
          return yield* this.blockSequence(top);
        case "flow-collection":
          return yield* this.flowCollection(top);
        case "doc-end":
          return yield* this.documentEnd(top);
      }
      yield* this.pop();
    }
    peek(n) {
      return this.stack[this.stack.length - n];
    }
    *pop(error) {
      const token = error ?? this.stack.pop();
      if (!token) {
        const message = "Tried to pop an empty stack";
        yield { type: "error", offset: this.offset, source: "", message };
      } else if (this.stack.length === 0) {
        yield token;
      } else {
        const top = this.peek(1);
        if (token.type === "block-scalar") {
          token.indent = "indent" in top ? top.indent : 0;
        } else if (token.type === "flow-collection" && top.type === "document") {
          token.indent = 0;
        }
        if (token.type === "flow-collection")
          fixFlowSeqItems(token);
        switch (top.type) {
          case "document":
            top.value = token;
            break;
          case "block-scalar":
            top.props.push(token);
            break;
          case "block-map": {
            const it = top.items[top.items.length - 1];
            if (it.value) {
              top.items.push({ start: [], key: token, sep: [] });
              this.onKeyLine = true;
              return;
            } else if (it.sep) {
              it.value = token;
            } else {
              Object.assign(it, { key: token, sep: [] });
              this.onKeyLine = !it.explicitKey;
              return;
            }
            break;
          }
          case "block-seq": {
            const it = top.items[top.items.length - 1];
            if (it.value)
              top.items.push({ start: [], value: token });
            else
              it.value = token;
            break;
          }
          case "flow-collection": {
            const it = top.items[top.items.length - 1];
            if (!it || it.value)
              top.items.push({ start: [], key: token, sep: [] });
            else if (it.sep)
              it.value = token;
            else
              Object.assign(it, { key: token, sep: [] });
            return;
          }
          default:
            yield* this.pop();
            yield* this.pop(token);
        }
        if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
          const last = token.items[token.items.length - 1];
          if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
            if (top.type === "document")
              top.end = last.start;
            else
              top.items.push({ start: last.start });
            token.items.splice(-1, 1);
          }
        }
      }
    }
    *stream() {
      switch (this.type) {
        case "directive-line":
          yield { type: "directive", offset: this.offset, source: this.source };
          return;
        case "byte-order-mark":
        case "space":
        case "comment":
        case "newline":
          yield this.sourceToken;
          return;
        case "doc-mode":
        case "doc-start": {
          const doc = {
            type: "document",
            offset: this.offset,
            start: []
          };
          if (this.type === "doc-start")
            doc.start.push(this.sourceToken);
          this.stack.push(doc);
          return;
        }
      }
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML stream`,
        source: this.source
      };
    }
    *document(doc) {
      if (doc.value)
        return yield* this.lineEnd(doc);
      switch (this.type) {
        case "doc-start": {
          if (findNonEmptyIndex(doc.start) !== -1) {
            yield* this.pop();
            yield* this.step();
          } else
            doc.start.push(this.sourceToken);
          return;
        }
        case "anchor":
        case "tag":
        case "space":
        case "comment":
        case "newline":
          doc.start.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(doc);
      if (bv)
        this.stack.push(bv);
      else {
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML document`,
          source: this.source
        };
      }
    }
    *scalar(scalar) {
      if (this.type === "map-value-ind") {
        const prev = getPrevProps(this.peek(2));
        const start = getFirstKeyStartProps(prev);
        let sep3;
        if (scalar.end) {
          sep3 = scalar.end;
          sep3.push(this.sourceToken);
          delete scalar.end;
        } else
          sep3 = [this.sourceToken];
        const map = {
          type: "block-map",
          offset: scalar.offset,
          indent: scalar.indent,
          items: [{ start, key: scalar, sep: sep3 }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map;
      } else
        yield* this.lineEnd(scalar);
    }
    *blockScalar(scalar) {
      switch (this.type) {
        case "space":
        case "comment":
        case "newline":
          scalar.props.push(this.sourceToken);
          return;
        case "scalar":
          scalar.source = this.source;
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine) {
            let nl = this.source.indexOf(`
`) + 1;
            while (nl !== 0) {
              this.onNewLine(this.offset + nl);
              nl = this.source.indexOf(`
`, nl) + 1;
            }
          }
          yield* this.pop();
          break;
        default:
          yield* this.pop();
          yield* this.step();
      }
    }
    *blockMap(map) {
      const it = map.items[map.items.length - 1];
      switch (this.type) {
        case "newline":
          this.onKeyLine = false;
          if (it.value) {
            const end = "end" in it.value ? it.value.end : undefined;
            const last = Array.isArray(end) ? end[end.length - 1] : undefined;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              map.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "space":
        case "comment":
          if (it.value) {
            map.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            if (this.atIndentedComment(it.start, map.indent)) {
              const prev = map.items[map.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                Array.prototype.push.apply(end, it.start);
                end.push(this.sourceToken);
                map.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
      }
      if (this.indent >= map.indent) {
        const atMapIndent = !this.onKeyLine && this.indent === map.indent;
        const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
        let start = [];
        if (atNextItem && it.sep && !it.value) {
          const nl = [];
          for (let i = 0;i < it.sep.length; ++i) {
            const st = it.sep[i];
            switch (st.type) {
              case "newline":
                nl.push(i);
                break;
              case "space":
                break;
              case "comment":
                if (st.indent > map.indent)
                  nl.length = 0;
                break;
              default:
                nl.length = 0;
            }
          }
          if (nl.length >= 2)
            start = it.sep.splice(nl[1]);
        }
        switch (this.type) {
          case "anchor":
          case "tag":
            if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map.items.push({ start });
              this.onKeyLine = true;
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "explicit-key-ind":
            if (!it.sep && !it.explicitKey) {
              it.start.push(this.sourceToken);
              it.explicitKey = true;
            } else if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map.items.push({ start, explicitKey: true });
            } else {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [this.sourceToken], explicitKey: true }]
              });
            }
            this.onKeyLine = true;
            return;
          case "map-value-ind":
            if (it.explicitKey) {
              if (!it.sep) {
                if (includesToken(it.start, "newline")) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else {
                  const start2 = getFirstKeyStartProps(it.start);
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                  });
                }
              } else if (it.value) {
                map.items.push({ start: [], key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start, key: null, sep: [this.sourceToken] }]
                });
              } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                const start2 = getFirstKeyStartProps(it.start);
                const key = it.key;
                const sep3 = it.sep;
                sep3.push(this.sourceToken);
                delete it.key;
                delete it.sep;
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key, sep: sep3 }]
                });
              } else if (start.length > 0) {
                it.sep = it.sep.concat(start, this.sourceToken);
              } else {
                it.sep.push(this.sourceToken);
              }
            } else {
              if (!it.sep) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else if (it.value || atNextItem) {
                map.items.push({ start, key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [], key: null, sep: [this.sourceToken] }]
                });
              } else {
                it.sep.push(this.sourceToken);
              }
            }
            this.onKeyLine = true;
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs13 = this.flowScalar(this.type);
            if (atNextItem || it.value) {
              map.items.push({ start, key: fs13, sep: [] });
              this.onKeyLine = true;
            } else if (it.sep) {
              this.stack.push(fs13);
            } else {
              Object.assign(it, { key: fs13, sep: [] });
              this.onKeyLine = true;
            }
            return;
          }
          default: {
            const bv = this.startBlockValue(map);
            if (bv) {
              if (bv.type === "block-seq") {
                if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                  yield* this.pop({
                    type: "error",
                    offset: this.offset,
                    message: "Unexpected block-seq-ind on same line with key",
                    source: this.source
                  });
                  return;
                }
              } else if (atMapIndent) {
                map.items.push({ start });
              }
              this.stack.push(bv);
              return;
            }
          }
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *blockSequence(seq) {
      const it = seq.items[seq.items.length - 1];
      switch (this.type) {
        case "newline":
          if (it.value) {
            const end = "end" in it.value ? it.value.end : undefined;
            const last = Array.isArray(end) ? end[end.length - 1] : undefined;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              seq.items.push({ start: [this.sourceToken] });
          } else
            it.start.push(this.sourceToken);
          return;
        case "space":
        case "comment":
          if (it.value)
            seq.items.push({ start: [this.sourceToken] });
          else {
            if (this.atIndentedComment(it.start, seq.indent)) {
              const prev = seq.items[seq.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                Array.prototype.push.apply(end, it.start);
                end.push(this.sourceToken);
                seq.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
        case "anchor":
        case "tag":
          if (it.value || this.indent <= seq.indent)
            break;
          it.start.push(this.sourceToken);
          return;
        case "seq-item-ind":
          if (this.indent !== seq.indent)
            break;
          if (it.value || includesToken(it.start, "seq-item-ind"))
            seq.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
      }
      if (this.indent > seq.indent) {
        const bv = this.startBlockValue(seq);
        if (bv) {
          this.stack.push(bv);
          return;
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *flowCollection(fc) {
      const it = fc.items[fc.items.length - 1];
      if (this.type === "flow-error-end") {
        let top;
        do {
          yield* this.pop();
          top = this.peek(1);
        } while (top && top.type === "flow-collection");
      } else if (fc.end.length === 0) {
        switch (this.type) {
          case "comma":
          case "explicit-key-ind":
            if (!it || it.sep)
              fc.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
          case "map-value-ind":
            if (!it || it.value)
              fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            return;
          case "space":
          case "comment":
          case "newline":
          case "anchor":
          case "tag":
            if (!it || it.value)
              fc.items.push({ start: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              it.start.push(this.sourceToken);
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs13 = this.flowScalar(this.type);
            if (!it || it.value)
              fc.items.push({ start: [], key: fs13, sep: [] });
            else if (it.sep)
              this.stack.push(fs13);
            else
              Object.assign(it, { key: fs13, sep: [] });
            return;
          }
          case "flow-map-end":
          case "flow-seq-end":
            fc.end.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(fc);
        if (bv)
          this.stack.push(bv);
        else {
          yield* this.pop();
          yield* this.step();
        }
      } else {
        const parent = this.peek(2);
        if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
          yield* this.pop();
          yield* this.step();
        } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          fixFlowSeqItems(fc);
          const sep3 = fc.end.splice(1, fc.end.length);
          sep3.push(this.sourceToken);
          const map = {
            type: "block-map",
            offset: fc.offset,
            indent: fc.indent,
            items: [{ start, key: fc, sep: sep3 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else {
          yield* this.lineEnd(fc);
        }
      }
    }
    flowScalar(type) {
      if (this.onNewLine) {
        let nl = this.source.indexOf(`
`) + 1;
        while (nl !== 0) {
          this.onNewLine(this.offset + nl);
          nl = this.source.indexOf(`
`, nl) + 1;
        }
      }
      return {
        type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
    }
    startBlockValue(parent) {
      switch (this.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return this.flowScalar(this.type);
        case "block-scalar-header":
          return {
            type: "block-scalar",
            offset: this.offset,
            indent: this.indent,
            props: [this.sourceToken],
            source: ""
          };
        case "flow-map-start":
        case "flow-seq-start":
          return {
            type: "flow-collection",
            offset: this.offset,
            indent: this.indent,
            start: this.sourceToken,
            items: [],
            end: []
          };
        case "seq-item-ind":
          return {
            type: "block-seq",
            offset: this.offset,
            indent: this.indent,
            items: [{ start: [this.sourceToken] }]
          };
        case "explicit-key-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          start.push(this.sourceToken);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, explicitKey: true }]
          };
        }
        case "map-value-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, key: null, sep: [this.sourceToken] }]
          };
        }
      }
      return null;
    }
    atIndentedComment(start, indent) {
      if (this.type !== "comment")
        return false;
      if (this.indent <= indent)
        return false;
      return start.every((st) => st.type === "newline" || st.type === "space");
    }
    *documentEnd(docEnd) {
      if (this.type !== "doc-mode") {
        if (docEnd.end)
          docEnd.end.push(this.sourceToken);
        else
          docEnd.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
      }
    }
    *lineEnd(token) {
      switch (this.type) {
        case "comma":
        case "doc-start":
        case "doc-end":
        case "flow-seq-end":
        case "flow-map-end":
        case "map-value-ind":
          yield* this.pop();
          yield* this.step();
          break;
        case "newline":
          this.onKeyLine = false;
        case "space":
        case "comment":
        default:
          if (token.end)
            token.end.push(this.sourceToken);
          else
            token.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
      }
    }
  }
  exports.Parser = Parser;
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS((exports) => {
  var composer = require_composer();
  var Document = require_Document();
  var errors = require_errors();
  var log = require_log();
  var identity = require_identity();
  var lineCounter = require_line_counter();
  var parser = require_parser();
  function parseOptions(options) {
    const prettyErrors = options.prettyErrors !== false;
    const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter || null;
    return { lineCounter: lineCounter$1, prettyErrors };
  }
  function parseAllDocuments(source, options = {}) {
    const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
    const composer$1 = new composer.Composer(options);
    const docs = Array.from(composer$1.compose(parser$1.parse(source)));
    if (prettyErrors && lineCounter2)
      for (const doc of docs) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
    if (docs.length > 0)
      return docs;
    return Object.assign([], { empty: true }, composer$1.streamInfo());
  }
  function parseDocument(source, options = {}) {
    const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
    const composer$1 = new composer.Composer(options);
    let doc = null;
    for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
      if (!doc)
        doc = _doc;
      else if (doc.options.logLevel !== "silent") {
        doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
        break;
      }
    }
    if (prettyErrors && lineCounter2) {
      doc.errors.forEach(errors.prettifyError(source, lineCounter2));
      doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
    }
    return doc;
  }
  function parse2(src, reviver, options) {
    let _reviver = undefined;
    if (typeof reviver === "function") {
      _reviver = reviver;
    } else if (options === undefined && reviver && typeof reviver === "object") {
      options = reviver;
    }
    const doc = parseDocument(src, options);
    if (!doc)
      return null;
    doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
    if (doc.errors.length > 0) {
      if (doc.options.logLevel !== "silent")
        throw doc.errors[0];
      else
        doc.errors = [];
    }
    return doc.toJS(Object.assign({ reviver: _reviver }, options));
  }
  function stringify2(value, replacer, options) {
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === undefined && replacer) {
      options = replacer;
    }
    if (typeof options === "string")
      options = options.length;
    if (typeof options === "number") {
      const indent = Math.round(options);
      options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent };
    }
    if (value === undefined) {
      const { keepUndefined } = options ?? replacer ?? {};
      if (!keepUndefined)
        return;
    }
    if (identity.isDocument(value) && !_replacer)
      return value.toString(options);
    return new Document.Document(value, _replacer, options).toString(options);
  }
  exports.parse = parse2;
  exports.parseAllDocuments = parseAllDocuments;
  exports.parseDocument = parseDocument;
  exports.stringify = stringify2;
});

// src/cli.ts
import * as fs16 from "node:fs";
import * as path16 from "node:path";

// src/commands.ts
import * as fs11 from "node:fs";
import * as path11 from "node:path";

// src/adapters.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// src/util.ts
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
var arr = (x) => x == null ? [] : Array.isArray(x) ? x : [x];
var randHex = (n) => randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);
function parseDuration(v) {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0)
    return v * 1000;
  if (typeof v !== "string")
    return null;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/.exec(v.trim());
  if (!m)
    return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  return Math.round(unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60000 : n * 3600000);
}
function fmtDuration(ms) {
  if (ms < 1000)
    return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60)
    return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)
    return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtBytes(n) {
  if (n < 1024)
    return `${n}B`;
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
function readJson(file, dflt) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return dflt;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + `
`);
  fs.renameSync(tmp, file);
}
function tailLines(file, lines = 80, maxBytes = 256 * 1024) {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const len = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    return buf.toString("utf8").split(/\r?\n/).filter((l) => l.trim() !== "").slice(-lines);
  } catch {
    return [];
  }
}
function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}
function pidAlive(pid) {
  if (!pid || pid <= 0)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}
function gitInfo(cwd) {
  const commit = git(cwd, ["rev-parse", "HEAD"]);
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = git(cwd, ["status", "--porcelain", "--untracked-files=normal", "--", ".", ":(exclude).witness"]);
  return { commit: commit.ok ? commit.out : "", branch: branch.ok ? branch.out : "", dirty: status.ok ? status.out !== "" : false };
}
function globToRegExp(glob) {
  let re = "";
  for (let i = 0;i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else
          re += ".*";
      } else
        re += "[^/]*";
    } else if (c === "?")
      re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0)
        re += "\\{";
      else {
        re += "(?:" + glob.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|") + ")";
        i = end;
      }
    } else
      re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
var SKIP_DIRS = new Set([".git", "node_modules", ".witness", ".venv", "venv", "__pycache__", ".gradle", ".idea"]);
function globFiles(base, globs, opts = {}) {
  const res = globs.map(globToRegExp);
  const skip = opts.skipDirs ?? SKIP_DIRS;
  const maxDepth = opts.maxDepth ?? 12;
  const out = [];
  const walk = (dir, rel, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!skip.has(e.name) && depth < maxDepth)
          walk(path.join(dir, e.name), r, depth + 1);
      } else if (res.some((x) => x.test(r)))
        out.push(r);
    }
  };
  walk(base, "", 0);
  return out.sort();
}
function shellWords(cmd) {
  const out = [];
  let cur = "";
  let has = false;
  let q = null;
  for (let i = 0;i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q)
        q = null;
      else if (c === "\\" && q === '"' && i + 1 < cmd.length)
        cur += cmd[++i];
      else
        cur += c;
    } else if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === "\\" && i + 1 < cmd.length) {
      cur += cmd[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur)
        out.push(cur);
      cur = "";
      has = false;
    } else if ("|&;<>()`$".includes(c))
      return null;
    else
      cur += c;
  }
  if (q)
    return null;
  if (has || cur)
    out.push(cur);
  return out;
}
var shq = (s) => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// src/adapters.ts
function normFile(f, cwd) {
  if (!f)
    return;
  let s = f.replace(/\\/g, "/");
  if (cwd && path2.isAbsolute(s)) {
    const rel = path2.relative(cwd, s).replace(/\\/g, "/");
    if (!rel.startsWith(".."))
      s = rel;
  }
  return s.replace(/^\.\//, "");
}
var clean = (s) => s.replace(/\s+/g, " ").trim();
function appendArgs(cmd, args) {
  if (!args)
    return cmd;
  if (/^\s*npm\s+(test|t|run\s+\S+|run-script\s+\S+)\b/.test(cmd) && !/\s--(\s|$)/.test(cmd))
    return `${cmd} -- ${args}`;
  return `${cmd} ${args}`;
}
var SELECT_VAR = /\$\{WITNESS_SELECT(?::-([^}]*))?\}/;
var hasSelectVar = (cmd) => SELECT_VAR.test(cmd);
function addArgs(cmd, args) {
  if (!args)
    return cmd;
  const m = SELECT_VAR.exec(cmd);
  return m ? `${cmd.slice(0, m.index)}${args} ${cmd.slice(m.index)}` : appendArgs(cmd, args);
}
function fillSelect(cmd, selection) {
  return cmd.replace(new RegExp(SELECT_VAR.source, "g"), (_m, dflt) => selection ?? dflt ?? "").replace(/[ \t]+$/, "");
}
var NO_TEST = "^witness-list-only: no test has this name$";
function classHash(c) {
  const cls = c.classname ? clean(c.classname) : "";
  let name = clean(c.name);
  if (cls && name.startsWith(`${cls}.`))
    name = name.slice(cls.length + 1);
  return cls ? `${cls}#${name}` : name;
}
function titled(c) {
  const titles = c.titles ?? [...c.classname && c.classname !== c.file ? [c.classname] : [], c.name];
  return [normFile(c.file), ...titles.map(clean)].filter(Boolean).join(" > ") + (c.project ? ` [${c.project}]` : "");
}
function pytestId(c) {
  const cls = c.classname ?? "";
  let file = normFile(c.file);
  let rest;
  if (file) {
    const mod = file.replace(/\.py$/, "").replace(/\//g, ".");
    rest = cls === mod ? [] : cls.startsWith(`${mod}.`) ? cls.slice(mod.length + 1).split(".") : [];
  } else {
    const segs = cls.split(".").filter(Boolean);
    let i = segs.findIndex((s, k) => k > 0 && /^[A-Z]/.test(s));
    if (i < 0)
      i = segs.length;
    file = segs.length ? `${segs.slice(0, i).join("/")}.py` : undefined;
    rest = segs.slice(i);
  }
  return [file, ...rest, c.name].filter(Boolean).join("::");
}
var PYTEST_VALUE_OPTS = new Set([
  "-k",
  "-m",
  "-c",
  "-p",
  "-o",
  "-n",
  "-W",
  "-r",
  "--rootdir",
  "--maxfail",
  "--tb",
  "--junitxml",
  "--junit-prefix",
  "--deselect",
  "--ignore",
  "--ignore-glob",
  "--durations",
  "--timeout",
  "--log-level",
  "--cov",
  "--cov-report",
  "--confcutdir",
  "--basetemp",
  "--import-mode",
  "--dist",
  "--reruns",
  "--color"
]);
function pytestSelect(cmd, ids) {
  const w = shellWords(cmd);
  if (!w)
    return null;
  let start = w.findIndex((x) => /(^|\/)(pytest|py\.test)$/.test(x));
  if (start < 0) {
    const m = w.findIndex((x, i) => x === "-m" && w[i + 1] === "pytest");
    if (m < 0)
      return null;
    start = m + 1;
  }
  const out = w.slice(0, start + 1);
  for (let i = start + 1;i < w.length; i++) {
    const t = w[i];
    if (t.startsWith("-")) {
      out.push(t);
      if (PYTEST_VALUE_OPTS.has(t) && i + 1 < w.length)
        out.push(w[++i]);
    }
  }
  return [...out, ...ids].map(shq).join(" ");
}
var stripParams = (m) => m.replace(/[([].*$/, "");
function splitClassHash(id) {
  const i = id.indexOf("#");
  return i < 0 ? ["", id] : [id.slice(0, i), id.slice(i + 1)];
}
function fullTitleRegex(ids, sep) {
  const parts = ids.map((id) => id.replace(/ \[[^\]]+\]$/, "").split(" > ").slice(1).map(escapeRegExp).join(sep));
  return `(${parts.join("|")})$`;
}
function goSelectArgs(ids) {
  const names = ids.map((id) => splitClassHash(id)[1]);
  const top = [...new Set(names.map((n) => n.split("/")[0]))];
  const subs = names.filter((n) => n.includes("/"));
  let run = `^(${top.map(escapeRegExp).join("|")})$`;
  if (subs.length && top.length === 1 && subs.length === names.length) {
    run += `/^(${subs.map((n) => escapeRegExp(n.split("/").slice(1).join("/"))).join("|")})$`;
  }
  return `-run ${shq(run)}`;
}
function parseLines(out, re, map) {
  const ids = [];
  for (const line of out.split(/\r?\n/)) {
    const m = re.exec(line);
    if (m)
      ids.push(map(m));
  }
  return [...new Set(ids)];
}
function dotnetFqnToId(fqn) {
  const paren = fqn.indexOf("(");
  const head = paren < 0 ? fqn : fqn.slice(0, paren);
  const dot = head.lastIndexOf(".");
  return dot < 0 ? fqn : `${fqn.slice(0, dot)}#${fqn.slice(dot + 1)}`;
}
function goListParse(out) {
  const ids = [];
  let pending = [];
  for (const line of out.split(/\r?\n/)) {
    const ok = /^ok\s+(\S+)/.exec(line);
    if (ok) {
      ids.push(...pending.map((t) => `${ok[1]}#${t}`));
      pending = [];
    } else if (/^(Test|Example|Fuzz)\w*$/.test(line.trim()))
      pending.push(line.trim());
  }
  return ids;
}
function playwrightListParse(out) {
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*(?:\[([^\]]+)\]\s+›\s+)?(\S+?):\d+:\d+\s+›\s+(.+)$/.exec(line);
    if (m)
      rows.push({ project: m[1] ?? "", rest: `${m[2]} > ${m[3].split(" › ").map(clean).join(" > ")}` });
  }
  const multi = new Set(rows.map((r) => r.project)).size > 1;
  return [...new Set(rows.map((r) => multi && r.project ? `${r.rest} [${r.project}]` : r.rest))];
}
function phpunitAborted(files, output) {
  const cases = files.flatMap((f) => f.cases);
  for (const block of output.split(/\r?\n(?=\d+\) \S+::\S)/)) {
    const head = /^\d+\) (\S+)::(\S+?)(?: with data set .*)?\r?\n/.exec(block);
    const why = /This test was aborted after (\d+) seconds?/.exec(block);
    if (!head || !why)
      continue;
    for (const c of cases) {
      if (c.classname !== head[1] || stripParams(c.name).replace(/ with data set .*$/, "") !== head[2] || c.status === "failed")
        continue;
      c.status = "failed";
      c.statusDetail = "timeout";
      c.message = `aborted after ${why[1]}s (phpunit time limit; reported as risky)`;
    }
  }
}
function dotnetHostDied(files, output) {
  const block = /The test running when the crash occurred:\s*\r?\n([\s\S]*?)\r?\nThis test may, or may not be the source of the crash/.exec(output);
  const target = files.find((f) => f.cases.length);
  if (!block || !target)
    return;
  const hang = /Blame' message: The specified inactivity time of (\d+) seconds? has elapsed/.exec(output);
  for (const fqn of block[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [cls, method] = splitClassHash(dotnetFqnToId(fqn));
    if (files.some((f) => f.cases.some((c) => c.classname === cls && (c.name === method || c.name === fqn))))
      continue;
    target.cases.push({ name: method, classname: cls, status: "failed", statusDetail: hang ? "timeout" : "error", durationMs: 0, message: hang ? `hung: no progress for ${hang[1]}s, so --blame-hang-timeout killed the test host` : "the test host crashed while this test ran" });
  }
}
function readUp(start, name) {
  const dirs = [];
  let text = "";
  for (let d = path2.resolve(start);; d = path2.dirname(d)) {
    dirs.push(d);
    const f = path2.join(d, name);
    if (fs2.existsSync(f)) {
      text = fs2.readFileSync(f, "utf8");
      break;
    }
    if (path2.dirname(d) === d || fs2.existsSync(path2.join(d, ".git")))
      break;
  }
  return { text, dirs };
}
function dotnetProject(cwd, cmd) {
  const m = /--project[ =]+["']?([^\s"']+)/.exec(cmd) ?? /(?:^|\s)["']?([^\s"']+\.(?:cs|fs|vb)proj)\b/.exec(cmd);
  return m ? path2.resolve(cwd, m[1]) : undefined;
}
function trxHint(cwd, cmd) {
  const proj = dotnetProject(cwd, cmd);
  const where = proj && path2.relative(cwd, proj) || "the test project";
  const add = `add <PackageReference Include="Microsoft.Testing.Extensions.TrxReport" /> to ${where}`;
  const start = proj ? path2.dirname(proj) : cwd;
  const props = readUp(start, "Directory.Packages.props");
  if (!props.text || !/<ManagePackageVersionsCentrally>\s*true\s*</i.test(props.text + readUp(start, "Directory.Build.props").text))
    return `this Microsoft.Testing.Platform project has no TRX reporter: ${add.replace(" />", ' Version="<version>" />')}`;
  const file = props.dirs.at(-1) ? path2.relative(cwd, path2.join(props.dirs.at(-1), "Directory.Packages.props")) : "Directory.Packages.props";
  const ver = /<PackageVersion\s+Include="Microsoft\.Testing\.(?:Platform|Extensions\.[\w.]+)"\s+Version="([^"]+)"/.exec(props.text)?.[1];
  return `this Microsoft.Testing.Platform project has no TRX reporter: ${add}, and <PackageVersion Include="Microsoft.Testing.Extensions.TrxReport" Version="${ver ?? "<version>"}" /> to ${file} (the repo uses central package management)`;
}
function dotnetMode(cwd, cmd = "") {
  const gj = readUp(cwd, "global.json").text;
  let mtp = false;
  try {
    mtp = /Microsoft\.Testing\.Platform/.test(JSON.parse(gj || "{}")?.test?.runner ?? "");
  } catch {
    mtp = false;
  }
  if (!mtp)
    return "vstest";
  const proj = dotnetProject(cwd, cmd);
  if (proj && fs2.existsSync(proj)) {
    const text = fs2.readFileSync(proj, "utf8") + readUp(path2.dirname(proj), "Directory.Build.props").text;
    if (/"xunit\.v3(\.mtp-v\d)?"/.test(text))
      return "mtp-xunit";
    if (/Microsoft\.Testing\.Extensions\.TrxReport|Sdk="MSTest\.Sdk|Include="MSTest"|Include="TUnit"/.test(text))
      return "mtp";
    return "mtp-none";
  }
  return /"xunit\.v3"/.test(readUp(cwd, "Directory.Packages.props").text) ? "mtp-xunit" : "mtp";
}
var ADAPTERS = {
  pytest: {
    name: "pytest",
    format: "junit",
    reportArgs: (d) => `--junitxml=${shq(path2.join(d, "junit.xml"))} -o junit_family=xunit1`,
    reportMarker: /--junit-?xml/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => ids.map(shq).join(" "),
    select: pytestSelect,
    list: { args: "--collect-only -q", format: "adapter", parse: (out) => parseLines(out, /^(\S+\.py::\S.*)$/, (m) => m[1].trim()) },
    perTestTimeout: (ms) => `--timeout=${Math.ceil(ms / 1000)}`,
    plugins: [{ name: "pytest-timeout", needed: (ptt) => ptt, probeArgs: "--collect-only -q --timeout=1", missing: /unrecognized arguments:.*--timeout/, hint: "per_test_timeout needs the pytest-timeout plugin: add pytest-timeout to the test requirements and install it" }],
    id: pytestId
  },
  "junit-maven": {
    name: "junit-maven",
    format: "junit",
    reportGlobs: [
      { base: "cwd", glob: "**/target/surefire-reports/TEST-*.xml" },
      { base: "cwd", glob: "**/target/failsafe-reports/TEST-*.xml" }
    ],
    selectArgs: (ids) => `${shq(`-Dtest=${ids.map((id) => {
      const [c, m] = splitClassHash(id);
      return `${c}#${stripParams(m)}`;
    }).join(",")}`)} -Dsurefire.failIfNoSpecifiedTests=false -DfailIfNoTests=false`,
    perTestTimeout: (ms) => shq(`-Djunit.jupiter.execution.timeout.default=${Math.ceil(ms / 1000)} s`),
    id: classHash
  },
  "junit-gradle": {
    name: "junit-gradle",
    format: "junit",
    reportArgs: () => "--rerun",
    reportMarker: /--rerun\b|--rerun-tasks|\bcleanTest\b/,
    reportGlobs: [{ base: "cwd", glob: "**/build/test-results/**/*.xml" }],
    selectArgs: (ids) => ids.map((id) => {
      const [c, m] = splitClassHash(id);
      return `--tests ${shq(`${c}.${stripParams(m)}`)}`;
    }).join(" "),
    id: classHash
  },
  dotnet: {
    name: "dotnet",
    format: "trx",
    reportArgs: (d, cwd, cmd) => {
      const mode = dotnetMode(cwd, cmd);
      if (mode === "mtp-none")
        return "";
      return `${mode === "vstest" ? "--logger trx" : mode === "mtp-xunit" ? "--report-xunit-trx" : "--report-trx"} --results-directory ${shq(d)}`;
    },
    reportHint: (cwd, cmd) => dotnetMode(cwd, cmd) === "mtp-none" ? trxHint(cwd, cmd) : undefined,
    reportMarker: /--logger[ =:]+["']?trx|--report-(xunit-)?trx/,
    reportGlobs: [
      { base: "report-dir", glob: "**/*.trx" },
      { base: "cwd", glob: "**/TestResults/**/*.trx" }
    ],
    selectArgs: (ids) => `--filter ${shq(ids.map((id) => {
      const [c, m] = splitClassHash(id);
      return `FullyQualifiedName=${c}.${stripParams(m)}`;
    }).join("|"))}`,
    list: {
      args: "--list-tests",
      format: "adapter",
      parse: (out) => {
        const ids = [];
        let on = false;
        for (const line of out.split(/\r?\n/)) {
          if (/The following Tests are available|^Discovered \d+ tests? in/.test(line))
            on = true;
          else if (on && /^\s{2,}\S/.test(line))
            ids.push(dotnetFqnToId(line.trim()));
          else if (on && line.trim() && !/^\s/.test(line))
            on = false;
        }
        return [...new Set(ids)];
      }
    },
    perTestTimeout: (ms, cwd, cmd) => dotnetMode(cwd, cmd) === "vstest" ? `--blame-hang-timeout ${Math.ceil(ms / 1000)}s` : null,
    amend: dotnetHostDied,
    id: classHash
  },
  jest: {
    name: "jest",
    format: "jest-json",
    reportArgs: (d) => `--json --outputFile=${shq(path2.join(d, "jest.json"))}`,
    reportMarker: /--json\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.json" }],
    selectArgs: (ids) => `-t ${shq(fullTitleRegex(ids, " "))}`,
    list: { args: `--testNamePattern=${shq(NO_TEST)}`, format: "report" },
    perTestTimeout: (ms) => `--testTimeout=${ms} --forceExit`,
    id: titled
  },
  vitest: {
    name: "vitest",
    format: "junit",
    reportArgs: (d) => `--reporter=default --reporter=junit --outputFile.junit=${shq(path2.join(d, "junit.xml"))}`,
    reportMarker: /--reporter[= ]junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => `-t ${shq(fullTitleRegex(ids, "(?: > | )"))}`,
    list: { args: `-t ${shq(NO_TEST)}`, format: "report" },
    perTestTimeout: (ms) => `--testTimeout=${ms}`,
    id: (c) => titled({ ...c, titles: c.titles ?? c.name.split(" > "), file: c.file ?? c.classname })
  },
  playwright: {
    name: "playwright",
    format: "playwright-json",
    reportArgs: () => "--reporter=list,json",
    reportEnv: (d) => ({ PLAYWRIGHT_JSON_OUTPUT_NAME: path2.join(d, "playwright.json"), PLAYWRIGHT_JSON_OUTPUT_FILE: path2.join(d, "playwright.json") }),
    reportMarker: /--reporter/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.json" }],
    selectArgs: (ids) => `${[...new Set(ids.map((id) => id.split(" > ")[0]))].map(shq).join(" ")} --grep ${shq(fullTitleRegex(ids, " "))}`,
    list: { args: "--list", format: "adapter", parse: playwrightListParse },
    perTestTimeout: (ms) => `--timeout=${ms}`,
    id: titled
  },
  go: {
    name: "go",
    format: "go-json",
    reportArgs: () => "-json",
    reportMarker: /\s-json\b/,
    reportGlobs: [],
    fromStdout: true,
    selectArgs: goSelectArgs,
    list: {
      rewrite: (cmd) => /\bgo\s+test\b/.test(cmd) ? cmd.replace(/\s-json\b/, "").replace(/\s-run\s+\S+/, "") : null,
      args: "-list .",
      format: "adapter",
      parse: goListParse
    },
    id: classHash
  },
  mocha: {
    name: "mocha",
    format: "junit",
    reportArgs: (d) => `--reporter xunit --reporter-option output=${shq(path2.join(d, "mocha.xml"))}`,
    reportMarker: /--reporter\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => `--grep ${shq(fullTitleRegex(ids, " "))}`,
    list: { args: "--dry-run", format: "report" },
    perTestTimeout: (ms) => `--timeout ${ms} --exit`,
    id: titled
  },
  rspec: {
    name: "rspec",
    format: "junit",
    reportArgs: (d) => `--format progress --format RspecJunitFormatter --out ${shq(path2.join(d, "rspec.xml"))}`,
    reportMarker: /RspecJunitFormatter/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => ids.map((id) => `-e ${shq(id.split(" > ").slice(1).join(" > "))}`).join(" "),
    list: { args: "--dry-run", format: "report" },
    plugins: [{ name: "rspec_junit_formatter", needed: () => true, probeArgs: "--dry-run --format RspecJunitFormatter --out /dev/null", missing: /cannot load such file -- rspec_junit_formatter|Formatter '?RspecJunitFormatter'? unknown|uninitialized constant RspecJunitFormatter/, hint: 'witness reads rspec results through the rspec_junit_formatter gem: add gem "rspec_junit_formatter" to the Gemfile (test group) and bundle install' }],
    id: (c) => [normFile(c.file) ?? c.classname, clean(c.name)].filter(Boolean).join(" > ")
  },
  phpunit: {
    name: "phpunit",
    format: "junit",
    reportArgs: (d) => `--log-junit ${shq(path2.join(d, "phpunit.xml"))}`,
    reportMarker: /--log-junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => {
      const pat = ids.map((id) => {
        const [c, m] = splitClassHash(id);
        return `${escapeRegExp(c)}::${escapeRegExp(stripParams(m).replace(/ with data set .*$/, ""))}`;
      });
      return `--filter ${shq(`/(${pat.join("|")})( with data set .*)?$/`)}`;
    },
    list: { args: "--list-tests", format: "adapter", parse: (out) => parseLines(out, /^\s*-\s+(\S+)::(\S+)/, (m) => `${m[1]}#${m[2]}`) },
    perTestTimeout: (ms) => `--enforce-time-limit --default-time-limit=${Math.ceil(ms / 1000)}`,
    amend: phpunitAborted,
    plugins: [{ name: "phpunit/php-invoker", needed: (ptt) => ptt, missing: /php-invoker|pcntl extension is required/i, hint: "phpunit enforces per-test time limits only with the phpunit/php-invoker package and the pcntl extension: composer require --dev phpunit/php-invoker" }],
    id: classHash
  },
  generic: {
    name: "generic",
    format: "junit",
    reportGlobs: [{ base: "report-dir", glob: "**/*.{xml,trx,json}" }],
    id: classHash
  }
};
var stableId = (adapter, id) => `${adapter}:${id}`;
function selectCommand(adapter, cmd, ids, template) {
  if (template) {
    if (template.includes("{ids}"))
      return template.replace("{ids}", () => ids.map(shq).join(" "));
    if (template.includes("{id}") && ids.length === 1)
      return template.replace("{id}", () => shq(ids[0]));
    return null;
  }
  if (hasSelectVar(cmd))
    return adapter.selectArgs ? fillSelect(cmd, adapter.selectArgs(ids)) : null;
  if (adapter.select)
    return adapter.select(cmd, ids);
  return adapter.selectArgs ? appendArgs(cmd, adapter.selectArgs(ids)) : null;
}

// src/config.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// node_modules/smol-toml/dist/error.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r?\n/);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r?\n/);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1;i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += `
`;
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += `^
`;
    }
  }
  return codeblock;
}

class TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
  static x(message, ctx, ptr) {
    throw new TomlError(message, { toml: ctx.s, ptr: ptr ?? ctx.p });
  }
}

// node_modules/smol-toml/dist/primitive.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function parseString(ctx) {
  let startPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (;ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in strings", ctx);
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state) {
        let s = ctx.s.slice(sliceStart, ctx.p);
        parsed = parsed ? parsed + s : s;
      }
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let errPtr = ctx.p++ - 1;
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0;j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p);
          let digit = hex >= 48 && hex <= 57 ? hex - 48 : hex >= 65 && hex <= 70 ? hex - 65 + 10 : hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1;
          if (digit < 0)
            TomlError.x("invalid non-hex character in unicode escape", ctx);
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          TomlError.x("invalid unicode escape", ctx, errPtr);
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p--;
        state = 0;
      } else if (isMultiline && (c === 32 || c === 9)) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "\t";
        else if (c === 110)
          parsed += `
`;
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          TomlError.x("unrecognised escape sequence", ctx);
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2)
        TomlError.x("invalid escape: only line-ending whitespace may be escaped", ctx, sliceStart);
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  TomlError.x("unfinished string", ctx, startPtr);
}

// node_modules/smol-toml/dist/date.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[Tt ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|z|[-+]\d{2}:\d{2})?$/i;

class TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date, fasttype, unsafeDelim) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    let c;
    if (typeof date === "string") {
      if (fasttype)
        prep: {
          if (fasttype < 3) {
            if (+date.slice(11, 13) > 23) {
              date = "";
              break prep;
            }
            if (fasttype === 2) {
              offset = null;
              date += "Z";
            } else if ((c = date.charCodeAt(date.length - 1)) !== 90 && c !== 122) {
              offset = date.slice(date.length - 6);
            }
            if (unsafeDelim)
              date = date.slice(0, 10) + "T" + date.slice(11);
          } else if (fasttype === 4) {
            date = +date.slice(0, 2) > 23 ? "" : `0000-01-01T${date}Z`;
          }
          hasDate = fasttype !== 4;
          hasTime = fasttype !== 3;
        }
      else {
        let match = date.match(DATE_TIME_RE);
        if (match) {
          if (!match[1]) {
            hasDate = false;
            date = `0000-01-01T${date}`;
          }
          hasTime = !!match[2];
          hasTime && date[10] === " " && (date = date.replace(" ", "T"));
          if (match[2] && +match[2] > 23) {
            date = "";
          } else {
            offset = match[3] || null;
            if (!offset && hasTime)
              date += "Z";
          }
        } else {
          date = "";
        }
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z" || this.#offset === "z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 60000);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
}

// node_modules/smol-toml/dist/extract.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function isDigit(char, base = 10) {
  return base === 16 ? char > 47 && char < 58 || char > 64 && char < 71 || char > 96 && char < 103 : char > 47 && char < 48 + base;
}
function isEndOfValue(char, delim) {
  return char === 32 || char === 9 || char === 10 || char === 13 || delim && (char === delim || char === 44) || char === 35;
}
function extractValue(ctx, end) {
  let errPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p);
  if (c === 91 || c === 123) {
    ctx.d-- || TomlError.x("document contains excessively nested structures. aborting.", ctx);
    let value = c === 91 ? parseArray(ctx) : parseInlineTable(ctx);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, false;
  }
  if (c === 43 || c === 45) {
    return parseNumber(ctx, ctx.p, ctx.s.charCodeAt(++ctx.p), 44 - c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 4) === 45 && ctx.s.charCodeAt(ctx.p + 7) === 45) {
    return parseDate(ctx, c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 2) === 58) {
    return parseTime(ctx, c, end);
  }
  return parseNumber(ctx, ctx.p, c, 0, end);
}
function parseNumber(ctx, startPtr, startChr, sign, endChr) {
  let c = startChr;
  let state = 0;
  let hasUnderscores = false;
  if (c === 105) {
    if (ctx.s.charCodeAt(++ctx.p) !== 110 || ctx.s.charCodeAt(++ctx.p) !== 102)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, (sign || 1) / 0;
  }
  if (c === 110) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 110)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, NaN;
  }
  if (c === 48) {
    if (++ctx.p >= ctx.s.length || isEndOfValue(c = ctx.s.charCodeAt(ctx.p), endChr))
      return ctx.bi === true ? 0n : 0;
    if (!sign) {
      if (c === 120)
        return parseIntegerBaseN(ctx, startPtr, 16, endChr);
      else if (c === 98)
        return parseIntegerBaseN(ctx, startPtr, 2, endChr);
      else if (c === 111)
        return parseIntegerBaseN(ctx, startPtr, 8, endChr);
    }
    if (c === 46)
      state = 2;
    else if (c === 101 || c === 69)
      state = 4;
    else
      TomlError.x("illegal leading zero", ctx, startPtr);
  } else if (!isDigit(c))
    TomlError.x("invalid value", ctx, startPtr);
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (!state)
      state = 1;
    if (c === 95) {
      if (!(state & 1))
        TomlError.x("illegal underscore", ctx);
      state += 11;
      hasUnderscores = true;
    } else if (state === 1 && c === 46)
      state = 2;
    else if ((state === 1 || state === 3) && (c === 101 || c === 69))
      state = 4;
    else if (state === 4 && (c === 43 || c === 45)) {
      state = 6;
    } else if (!isDigit(c))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (state > 9)
      state -= 11;
    else if (!(state & 1))
      state++;
  }
  if (!state) {
    let val = (startChr - 48) * (sign || 1);
    return ctx.bi === true ? BigInt(val) : val;
  }
  if (!(state & 1))
    TomlError.x("unfinished numeric value", ctx, startPtr);
  let str = ctx.s.slice(startPtr, ctx.p);
  if (hasUnderscores)
    str = str.replaceAll("_", "");
  return state > 1 ? parseFloat(str) : parseInteger(ctx, str, 10, startPtr);
}
function parseIntegerBaseN(ctx, startPtr, base, endChr) {
  let c, underscore = 1;
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (c === 95) {
      if (underscore & 1)
        TomlError.x("illegal underscore", ctx);
      underscore = 3;
    } else if (!isDigit(c, base))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (underscore & 1)
      underscore--;
  }
  if (underscore & 1)
    TomlError.x("unfinished numeric value", ctx);
  let str = ctx.s.slice(startPtr + 2, ctx.p);
  if (underscore)
    str = str.replaceAll("_", "");
  return parseInteger(ctx, str, base, startPtr);
}
function parseInteger(ctx, str, base, startPtr) {
  if (ctx.bi !== true)
    int: {
      let val = parseInt(str, base);
      if (!Number.isSafeInteger(val)) {
        if (ctx.bi)
          break int;
        TomlError.x("integer value cannot be represented losslessly", ctx, startPtr);
      }
      return val;
    }
  return base === 10 ? BigInt(str) : BigInt((base === 2 ? "0b" : base === 8 ? "0o" : "0x") + str);
}
function parseDate(ctx, c, endChr) {
  let startPtr = ctx.p++, unsafeSeparator;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++))) {
    return parseNumber(ctx, ctx.p = startPtr, c, 0, endChr);
  }
  ctx.p += 5;
  if (!isDigit(ctx.s.charCodeAt(ctx.p++)))
    TomlError.x("invalid date-time: date part is malformed", ctx, startPtr);
  if (ctx.p >= ctx.s.length || ((c = ctx.s.charCodeAt(ctx.p)) !== 32 || (unsafeSeparator = true, !isDigit(ctx.s.charCodeAt(ctx.p + 1)))) && c !== 84 && c !== 116) {
    let t2 = ctx.s.slice(startPtr, ctx.p);
    return readDate(ctx, t2, 3, false, startPtr);
  }
  if (ctx.s.charCodeAt(ctx.p += 3) !== 58)
    TomlError.x("invalid date-time: time part is malformed", ctx, startPtr);
  if (ctx.s.charCodeAt(ctx.p += 3) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  if (c = ctx.s.charCodeAt(ctx.p)) {
    if (c === 90 || c === 122) {
      let t2 = ctx.s.slice(startPtr, ++ctx.p);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, "[+00:00]");
    }
    if (c === 43 || c === 45) {
      let t2 = ctx.s.slice(startPtr, ctx.p += 6);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, !ctx.ld && "[" + ctx.s.slice(ctx.p - 6, ctx.p) + "]");
    }
  }
  let t = ctx.s.slice(startPtr, ctx.p);
  return readDate(ctx, t, 2, unsafeSeparator, startPtr);
}
function parseTime(ctx, c, endChr) {
  let start = ctx.p;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(++ctx.p))) {
    return parseNumber(ctx, --ctx.p, c, 0, endChr);
  }
  if (ctx.s.charCodeAt(ctx.p += 4) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  let t = ctx.s.slice(start, ctx.p);
  return readDate(ctx, t, 4, false, start);
}
function readDate(ctx, str, type, unsafeDelim, errPtr, temporalSuffix) {
  if (ctx.ld) {
    let date = new TomlDate(str, type, unsafeDelim);
    if (!date.isValid())
      TomlError.x("invalid date", ctx, errPtr);
    return date;
  }
  try {
    if (temporalSuffix)
      str += temporalSuffix;
    switch (type) {
      case 1:
        return Temporal.ZonedDateTime.from(str);
      case 2:
        return Temporal.PlainDateTime.from(str);
      case 3:
        return Temporal.PlainDate.from(str);
      case 4:
        return Temporal.PlainTime.from(str);
    }
  } catch (e) {
    TomlError.x(e instanceof Error ? e.message : "" + e, ctx, errPtr);
  }
}

// node_modules/smol-toml/dist/util.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function skipComment(ctx) {
  for (;ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in comments", ctx);
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (ctx.p < ctx.s.length) {
    while (ctx.p < ctx.s.length && ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}

// node_modules/smol-toml/dist/struct.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function parseKey(ctx, end = 61) {
  let startPtr;
  let state = 0;
  let parsed = [];
  let sliceStart;
  let c = ctx.s.charCodeAt(startPtr = ctx.p);
  do {
    if (c === end) {
      if (!state)
        TomlError.x("unexpected end of key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      return ctx.p++, parsed;
    } else if (c === 46) {
      if (!state)
        TomlError.x("illegal empty bare key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      state = 0;
    } else if (!state && (c === 34 || c === 39)) {
      if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2))
        TomlError.x("illegal quoted key: multiline strings are not allowed", ctx);
      parsed.push(parseString(ctx));
      state = 2;
      ctx.p--;
    } else if (c === 32 || c === 9) {
      if (state === 1) {
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
        state = 2;
      }
    } else if (state === 2 || c < 48 && c !== 45 || c > 57 && c < 65 || c > 90 && c < 97 && c !== 95 || c > 122) {
      TomlError.x("illegal character in key", ctx);
    } else if (!state) {
      state = 1;
      sliceStart = ctx.p;
    }
  } while (c = ctx.s.charCodeAt(++ctx.p));
  TomlError.x("incomplete key-value: cannot find end of key", ctx, startPtr);
}
function parseInlineTable(ctx) {
  let startPtr = ctx.p++;
  let res = Object.create(null);
  let seen = new Set;
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let errPtr = ctx.p;
    let key = parseKey(ctx);
    for (let i = 0;i < key.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = Object.create(null);
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        TomlError.x("trying to redefine an already defined value", ctx, errPtr);
      }
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor")) {
        t = ctx.uk !== 1 && TomlError.x("document contains an unsafe property", ctx, errPtr);
        break;
      }
      if (!hasOwn && unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      TomlError.x("trying to redefine an already defined value", ctx, errPtr);
    }
    skipVoid(ctx, true, true);
    let value = extractValue(ctx, 125);
    if (t && typeof (t[k] = value) === "object")
      seen.add(value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished table", ctx, startPtr);
}
function parseArray(ctx) {
  let startPtr = ctx.p++;
  let res = [];
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(ctx, 93));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished array", ctx, startPtr);
}

// node_modules/smol-toml/dist/parse.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function peekTable(ctx, key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0;i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = Object.create(null);
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor"))
        return false;
      if (unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: Object.create(null)
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = Object.create(null));
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: Object.create(null) };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = Object.create(null);
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function validateTablePeek(ctx, peek, ptr) {
  if (peek === null || ctx.uk === 2)
    TomlError.x(peek === null ? "trying to redefine an already defined table or value" : "document contains an unsafe property", ctx, ptr);
}
function parse(toml, options = {}) {
  let ctx = {
    s: toml,
    p: 0,
    d: options.maxDepth ?? 1000,
    bi: options.integersAsBigInt ?? false,
    ld: options.useLegacyDate ?? true,
    uk: options.unsafeKeyBehaviour === "throw" ? 2 : options.unsafeKeyBehaviour === "drop" ? 1 : 0
  };
  let res = Object.create(null);
  let meta = Object.create(null);
  let tmp;
  let skipping = false;
  let tbl = res;
  let m = meta;
  if (toml.charCodeAt(0) === 65279)
    ctx.p++;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      skipping = false;
      let k = parseKey(ctx, 93);
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p) !== 93) {
          TomlError.x("expected end of table array declaration", ctx);
        }
        ctx.p++;
      }
      let p = peekTable(ctx, k, res, meta, isTableArray ? 2 : 1);
      if (!p) {
        validateTablePeek(ctx, p, tmp);
        skipping = true;
      } else {
        m = p[2];
        tbl = p[1];
      }
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(ctx, k, tbl, m, 0);
      if (!p && !skipping)
        validateTablePeek(ctx, p, tmp);
      skipVoid(ctx, true, true);
      let v = extractValue(ctx, undefined);
      if (p && !skipping)
        p[1][p[0]] = v;
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && (tmp !== 13 || toml.charCodeAt(ctx.p + 1) !== 10)) {
      TomlError.x("each key-value declaration must be followed by an end-of-line", ctx);
    }
    skipVoid(ctx);
  }
  return res;
}

// node_modules/smol-toml/dist/stringify.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var HAS_WELLFORMED = !!"".isWellFormed;

// node_modules/smol-toml/dist/index.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// src/config.ts
class ConfigError extends Error {
  key;
  constructor(key, message) {
    super(key ? `${key}: ${message}` : message);
    this.key = key;
  }
}
var NAME = /^[A-Za-z][\w-]*$/;
var KEYS = {
  top: ["version", "env", "dependency", "service", "suite", "run"],
  env: ["file", "required"],
  dependency: ["name", "check", "check_http", "start", "stop", "timeout"],
  service: ["name", "cwd", "setup", "start", "stop", "pidfile", "ports", "ready", "env", "depends_on", "external", "role", "origin_for"],
  ready: ["http", "cmd", "status", "timeout"],
  suite: ["name", "service", "adapter", "cwd", "cmd", "timeout", "per_test_timeout", "per_test_timeout_arg", "report", "select", "list", "env"],
  list: ["cmd", "format", "report"],
  run: ["stall_timeout", "heartbeat", "keep_runs", "kill_grace"]
};
function closest(word, options) {
  let best;
  let bestD = 3;
  for (const o of options) {
    const d = editDistance(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1;j <= b.length; j++)
    dp[0][j] = j;
  for (let i = 1;i <= a.length; i++)
    for (let j = 1;j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
function checkKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      const hint = closest(k, allowed);
      throw new ConfigError(where ? `${where}.${k}` : k, `unknown key${hint ? ` (did you mean "${hint}"?)` : ""}`);
    }
  }
}
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
function str(o, k, where, required = false) {
  const v = o[k];
  if (v === undefined || v === "") {
    if (required)
      throw new ConfigError(`${where}.${k}`, "is required");
    return;
  }
  if (typeof v !== "string")
    throw new ConfigError(`${where}.${k}`, `expected a string, got ${typeof v}`);
  return v;
}
function dur(o, k, where, dflt) {
  const v = o[k];
  if (v === undefined)
    return dflt;
  const ms = parseDuration(v);
  if (ms == null)
    throw new ConfigError(`${where}.${k}`, `expected a duration like "30s", "5m" or "250ms", got ${JSON.stringify(v)}`);
  return ms;
}
function strMap(o, k, where) {
  const v = o[k];
  if (v === undefined)
    return {};
  if (!isObj(v))
    throw new ConfigError(`${where}.${k}`, "expected a table of strings");
  const out = {};
  for (const [kk, vv] of Object.entries(v)) {
    if (typeof vv === "string")
      out[kk] = vv;
    else if (typeof vv === "number" || typeof vv === "boolean")
      out[kk] = String(vv);
    else
      throw new ConfigError(`${where}.${k}.${kk}`, "expected a string");
  }
  return out;
}
function strList(o, k, where) {
  const v = o[k];
  if (v === undefined || v === "")
    return [];
  if (typeof v === "string")
    return [v];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new ConfigError(`${where}.${k}`, "expected a list of strings");
  return v;
}
function tables(doc, k) {
  const v = doc[k];
  if (v === undefined)
    return [];
  if (!Array.isArray(v))
    throw new ConfigError(k, `expected [[${k}]] tables`);
  return v.map((x, i) => {
    if (!isObj(x))
      throw new ConfigError(`${k}[${i}]`, "expected a table");
    return x;
  });
}
function parsePorts(v, where) {
  if (v === undefined || v === "")
    return;
  const s = typeof v === "number" ? String(v) : v;
  const m = typeof s === "string" ? /^(\d+)(?:\s*-\s*(\d+))?$/.exec(s.trim()) : null;
  if (!m)
    throw new ConfigError(`${where}.ports`, `expected a port or range like "3000-3005", got ${JSON.stringify(v)}`);
  const lo = Number(m[1]);
  const hi = Number(m[2] ?? m[1]);
  if (lo < 1 || hi > 65535 || lo > hi)
    throw new ConfigError(`${where}.ports`, `invalid port range ${lo}-${hi}`);
  return [lo, hi];
}
function findConfig(start) {
  let dir = path3.resolve(start);
  for (;; ) {
    const f = path3.join(dir, ".witness", "witness.toml");
    if (fs3.existsSync(f))
      return f;
    const up = path3.dirname(dir);
    if (up === dir)
      return null;
    dir = up;
  }
}
function rootFor(configFile) {
  const d = path3.dirname(path3.resolve(configFile));
  return path3.basename(d) === ".witness" ? path3.dirname(d) : d;
}
function loadConfig(file) {
  if (!fs3.existsSync(file))
    throw new ConfigError("", `config not found: ${file} (run \`witness init\`)`);
  let doc;
  try {
    doc = parse(fs3.readFileSync(file, "utf8"));
  } catch (e) {
    const err = e;
    throw new ConfigError("", `${path3.basename(file)} is not valid TOML${err.line ? ` (line ${err.line}, column ${err.column})` : ""}: ${err.message.split(`
`)[0]}`);
  }
  return parseConfig(doc, file);
}
function parseConfig(doc, file) {
  checkKeys(doc, KEYS.top, "");
  if (doc.version === undefined)
    throw new ConfigError("version", "is required (version = 1)");
  if (doc.version !== 1)
    throw new ConfigError("version", `unsupported version ${JSON.stringify(doc.version)}; this witness reads version 1`);
  const root = rootFor(file);
  const envT = doc.env === undefined ? {} : doc.env;
  if (!isObj(envT))
    throw new ConfigError("env", "expected a table");
  checkKeys(envT, KEYS.env, "env");
  const dependencies = tables(doc, "dependency").map((d, i) => {
    const where = `dependency[${i}]`;
    checkKeys(d, KEYS.dependency, where);
    const name = str(d, "name", where, true);
    const dep = {
      name,
      check: str(d, "check", where),
      checkHttp: str(d, "check_http", where),
      start: str(d, "start", where),
      stop: str(d, "stop", where),
      timeoutMs: dur(d, "timeout", where, 60000)
    };
    if (!dep.check && !dep.checkHttp)
      throw new ConfigError(`dependency[${i}]`, `"${name}" needs check or check_http`);
    return dep;
  });
  const services = tables(doc, "service").map((s, i) => {
    let where = `service[${i}]`;
    checkKeys(s, KEYS.service, where);
    const name = str(s, "name", where, true);
    if (!NAME.test(name))
      throw new ConfigError(`${where}.name`, `"${name}" must start with a letter and use only letters, digits, - and _`);
    where = `service.${name}`;
    let ready;
    if (s.ready !== undefined) {
      if (!isObj(s.ready))
        throw new ConfigError(`${where}.ready`, "expected { http = ... } or { cmd = ... }");
      checkKeys(s.ready, KEYS.ready, `${where}.ready`);
      const r = s.ready;
      ready = {
        http: str(r, "http", `${where}.ready`),
        cmd: str(r, "cmd", `${where}.ready`),
        status: typeof r.status === "number" ? r.status : undefined,
        timeoutMs: dur(r, "timeout", `${where}.ready`, 120000)
      };
      if (!ready.http === !ready.cmd)
        throw new ConfigError(`${where}.ready`, "set exactly one of http or cmd");
      if (r.status !== undefined && typeof r.status !== "number")
        throw new ConfigError(`${where}.ready.status`, "expected a number");
    }
    const role = str(s, "role", where) ?? "target";
    if (role !== "target" && role !== "origin")
      throw new ConfigError(`${where}.role`, `expected "target" or "origin", got "${role}"`);
    const svc = {
      name,
      cwd: str(s, "cwd", where) ?? ".",
      setup: str(s, "setup", where),
      start: str(s, "start", where),
      stop: str(s, "stop", where),
      pidfile: str(s, "pidfile", where),
      ports: parsePorts(s.ports, where),
      ready,
      env: strMap(s, "env", where),
      dependsOn: strList(s, "depends_on", where),
      external: str(s, "external", where),
      role,
      originFor: str(s, "origin_for", where)
    };
    if (!svc.start && !svc.external)
      throw new ConfigError(where, "needs start (a command) or external (a URL)");
    if (svc.external && !/^https?:\/\//.test(svc.external))
      throw new ConfigError(`${where}.external`, "expected an http(s) URL");
    if (!svc.ready && !svc.external)
      throw new ConfigError(`${where}.ready`, 'is required: a service counts as up only after its readiness check passes; set ready = { http = "${self.url}/health" } or ready = { cmd = "..." } (ready = { cmd = "true" } for a worker with nothing to probe)');
    return svc;
  });
  const suites = tables(doc, "suite").map((s, i) => {
    let where = `suite[${i}]`;
    checkKeys(s, KEYS.suite, where);
    const name = str(s, "name", where, true);
    if (!NAME.test(name))
      throw new ConfigError(`${where}.name`, `"${name}" must start with a letter and use only letters, digits, - and _`);
    where = `suite.${name}`;
    const adapter = str(s, "adapter", where) ?? "generic";
    if (!(adapter in ADAPTERS))
      throw new ConfigError(`${where}.adapter`, `unknown adapter "${adapter}"; one of ${Object.keys(ADAPTERS).join(", ")}`);
    const pttArg = str(s, "per_test_timeout_arg", where);
    if (pttArg && !/\{s\}|\{ms\}/.test(pttArg))
      throw new ConfigError(`${where}.per_test_timeout_arg`, 'needs {s} or {ms} where the timeout goes, e.g. "-timeout {s}s"');
    return {
      name,
      perTestTimeoutArg: pttArg,
      list: parseList(s.list, `${where}.list`, adapter),
      services: s.service === undefined ? undefined : strList(s, "service", where),
      adapter,
      cwd: str(s, "cwd", where) ?? ".",
      cmd: str(s, "cmd", where, true),
      timeoutMs: dur(s, "timeout", where, 30 * 60000),
      perTestTimeoutMs: dur(s, "per_test_timeout", where),
      report: str(s, "report", where),
      select: str(s, "select", where),
      env: strMap(s, "env", where)
    };
  });
  const runT = doc.run === undefined ? {} : doc.run;
  if (!isObj(runT))
    throw new ConfigError("run", "expected a table");
  checkKeys(runT, KEYS.run, "run");
  const keepRuns = runT.keep_runs ?? 10;
  if (typeof keepRuns !== "number" || keepRuns < 1)
    throw new ConfigError("run.keep_runs", "expected a positive number");
  const cfg = {
    version: 1,
    root,
    file: path3.resolve(file),
    envFile: str(envT, "file", "env"),
    required: strList(envT, "required", "env"),
    dependencies,
    services,
    suites,
    run: {
      stallMs: dur(runT, "stall_timeout", "run", 5 * 60000),
      heartbeatMs: dur(runT, "heartbeat", "run", 60000),
      keepRuns,
      graceMs: dur(runT, "kill_grace", "run", 5000)
    }
  };
  validateRefs(cfg);
  return cfg;
}
function parseList(v, where, adapter) {
  if (v === undefined || v === "")
    return;
  const native = ADAPTERS[adapter].list?.parse ? "adapter" : "lines";
  if (typeof v === "string")
    return { cmd: v, format: native };
  if (!isObj(v))
    throw new ConfigError(where, 'expected a command, or { cmd = "...", format = "lines" | "report" | "adapter" }');
  checkKeys(v, KEYS.list, where);
  const cmd = str(v, "cmd", where, true);
  const raw = str(v, "format", where) ?? native;
  const format = raw === "junit" ? "report" : raw;
  if (format !== "lines" && format !== "report" && format !== "adapter")
    throw new ConfigError(`${where}.format`, `expected "lines", "report" or "adapter", got "${raw}"`);
  if (format === "adapter" && !ADAPTERS[adapter].list?.parse)
    throw new ConfigError(`${where}.format`, `the ${adapter} adapter has no list parser; use "lines" (one id per line) or "report"`);
  return { cmd, format, report: str(v, "report", where) };
}
function validateRefs(cfg) {
  const names = new Set;
  for (const s of cfg.services) {
    if (names.has(s.name))
      throw new ConfigError(`service.${s.name}`, "duplicate service name");
    names.add(s.name);
  }
  for (const s of cfg.services) {
    for (const d of s.dependsOn)
      if (!names.has(d))
        throw new ConfigError(`service.${s.name}.depends_on`, `unknown service "${d}"`);
    if (s.originFor && !names.has(s.originFor))
      throw new ConfigError(`service.${s.name}.origin_for`, `unknown service "${s.originFor}"`);
  }
  topoOrder(cfg.services, cfg.services.map((s) => s.name));
  const suites = new Set;
  for (const s of cfg.suites) {
    if (suites.has(s.name))
      throw new ConfigError(`suite.${s.name}`, "duplicate suite name");
    suites.add(s.name);
    for (const svc of s.services ?? [])
      if (!names.has(svc))
        throw new ConfigError(`suite.${s.name}.service`, `unknown service "${svc}"`);
  }
  const refs = (where, text) => {
    for (const m of (text ?? "").matchAll(/\$\{([A-Za-z][\w-]*)\.url\}/g)) {
      if (m[1] !== "self" && !names.has(m[1]))
        throw new ConfigError(where, `\${${m[1]}.url} refers to an unknown service`);
    }
  };
  for (const s of cfg.services) {
    refs(`service.${s.name}.start`, s.start);
    refs(`service.${s.name}.setup`, s.setup);
    refs(`service.${s.name}.ready`, s.ready?.http ?? s.ready?.cmd);
    for (const [k, v] of Object.entries(s.env))
      refs(`service.${s.name}.env.${k}`, v);
  }
  for (const s of cfg.suites) {
    refs(`suite.${s.name}.cmd`, s.cmd);
    refs(`suite.${s.name}.list`, s.list?.cmd);
    for (const [k, v] of Object.entries(s.env))
      refs(`suite.${s.name}.env.${k}`, v);
  }
}
function topoOrder(services, wanted) {
  const byName = new Map(services.map((s) => [s.name, s]));
  const out = [];
  const state = new Map;
  const visit = (n, chain) => {
    const st = state.get(n);
    if (st === "done")
      return;
    if (st === "visiting")
      throw new ConfigError(`service.${n}.depends_on`, `dependency cycle: ${[...chain, n].join(" -> ")}`);
    state.set(n, "visiting");
    const s = byName.get(n);
    if (!s)
      throw new ConfigError("", `unknown service "${n}"`);
    for (const d of s.dependsOn)
      visit(d, [...chain, n]);
    state.set(n, "done");
    out.push(s);
  };
  for (const w of wanted)
    visit(w, []);
  return out;
}
function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#"))
      continue;
    const m = /^(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line);
    if (!m)
      continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2 || v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
      const dq = v[0] === '"';
      v = v.slice(1, -1);
      if (dq)
        v = v.replace(/\\n/g, `
`).replace(/\\"/g, '"');
    } else
      v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}
function loadEnv(cfg) {
  const env = {};
  let fileUsed;
  if (cfg.envFile) {
    const f = path3.resolve(cfg.root, cfg.envFile);
    if (fs3.existsSync(f)) {
      Object.assign(env, parseEnvFile(fs3.readFileSync(f, "utf8")));
      fileUsed = f;
    }
  }
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined)
      env[k] = v;
  const missing = cfg.required.filter((k) => !env[k]);
  return { env, missing, fileUsed };
}
function substitute(text, vars) {
  return text.replace(/\$\{([A-Za-z_][\w.-]*)\}/g, (m, name) => {
    const v = vars[name];
    return v === undefined ? m : v;
  });
}

// src/diagnosis.ts
var PATTERNS = [
  { cause: "port_in_use", re: /\bEADDRINUSE\b|[Aa]ddress already in use|port is already allocated|Failed to bind to address|Only one usage of each socket address|ports? \d+ (?:is|are) (?:already )?in use/ },
  { cause: "auth_failed", re: /\b401 Unauthorized\b|HTTP\/\d(?:\.\d)? 401\b|[Ss]tatus(?: code)?[:= ]+401\b|password authentication failed|[Aa]uthentication failed|Access denied for user|invalid_grant|[Ii]nvalid credentials|Login failed for user/ },
  { cause: "network", re: /\bENOTFOUND\b|\bEAI_AGAIN\b|getaddrinfo (?:ENOTFOUND|EAI_AGAIN|failed)|Name or service not known|Temporary failure in name resolution|nodename nor servname provided|Could not resolve host|No such host is known|NameResolutionError|UnknownHostException/ },
  { cause: "dependency_unreachable", re: /\bECONNREFUSED\b|[Cc]onnection refused|could not connect to server|actively refused|Connection reset by peer|Is the server running on host|server was not found or was not accessible/ },
  { cause: "missing_tool", re: /ModuleNotFoundError|No module named|Cannot find module|MODULE_NOT_FOUND|command not found|is not recognized as an internal or external command|Could not find or load main class|ClassNotFoundException|No such file or directory|ERR_MODULE_NOT_FOUND|You must install or update \.NET|A compatible \.NET SDK was not found|Could not execute because the specified command or file was not found/i }
];
var NO_REFINE = new Set(["bad_config", "missing_env", "stalled", "suite_timeout"]);
var RETRYABLE = new Set(["port_in_use", "network", "service_died", "stalled", "suite_timeout", "ready_timeout", "dependency_unreachable"]);
var FRAME = /^\s+(at\s|File "|\.\.\. \d+ more)|^\s+\S+\.go:\d+/;
var ERRORISH = /exception|error|fatal|panic|unhandled|traceback/i;
function lastMeaningful(lines, preferError) {
  let start = 0;
  lines.forEach((l, i) => {
    if (/^\s*\$ /.test(l))
      start = i + 1;
  });
  const cand = lines.slice(start).filter((l) => l.trim().length > 1 && !FRAME.test(l));
  const pool = cand.length ? cand : lines.filter((l) => !/^\s*\$ /.test(l) && l.trim().length > 1);
  return ((preferError ? [...pool].reverse().find((l) => ERRORISH.test(l) && !/\b0 (Error\(s\)|errors?)\b/i.test(l)) : undefined) ?? pool.at(-1))?.trim();
}
function diagnose(inp) {
  const lines = inp.log ? tailLines(inp.log, 200) : [];
  let cause = inp.cause;
  let evidence = inp.evidence;
  let missingTool = false;
  if (!NO_REFINE.has(cause)) {
    for (const p of PATTERNS) {
      const hit = [...lines].reverse().find((l) => p.re.test(l));
      if (!hit)
        continue;
      evidence = hit.trim().slice(0, 500);
      if (p.cause === "missing_tool")
        missingTool = true;
      else
        cause = p.cause;
      break;
    }
  }
  const linger = cause === "stalled" && !evidence ? lines.find((l) => /did not exit one second after the test run has completed/.test(l)) : undefined;
  if (linger) {
    evidence = linger.trim();
    inp = { ...inp, extraTry: ["the tests finished but open handles (a hung request, a server, a timer) kept jest running: close them in afterAll, or add --forceExit to the suite cmd", ...inp.extraTry ?? []] };
  }
  evidence ??= lastMeaningful(lines, cause !== "stalled" && cause !== "suite_timeout")?.slice(0, 500);
  const d = {
    stage: inp.stage,
    cause,
    retryable: RETRYABLE.has(cause) && !(cause === "ready_timeout" && inp.steadyStatus),
    try: []
  };
  if (inp.service)
    d.service = inp.service;
  if (inp.suite)
    d.suite = inp.suite;
  if (inp.command)
    d.command = inp.command;
  if (evidence)
    d.evidence = evidence;
  if (inp.log)
    d.log = inp.log;
  if (inp.envMissing?.length)
    d.env_missing = inp.envMissing;
  d.try = suggestions(d, inp, missingTool);
  return d;
}
function suggestions(d, inp, missingTool) {
  const t = [];
  const log = inp.log ? `tail -n 50 ${inp.log}` : undefined;
  const inCwd = (c) => c ? inp.cwd && inp.cwd !== "." ? `cd ${inp.cwd} && ${c}` : c : undefined;
  const svc = inp.service;
  switch (d.cause) {
    case "missing_env":
      for (const k of inp.envMissing ?? [])
        t.push(`echo '${k}=...' >> .witness/.env   # or export ${k}=...`);
      break;
    case "bad_config":
      t.push("witness check --stage config");
      break;
    case "dependency_unreachable":
      if (inp.command)
        t.push(inCwd(inp.command));
      t.push("witness check --stage deps");
      if (log)
        t.push(log);
      break;
    case "setup_failed":
      if (log)
        t.push(log);
      if (inp.command)
        t.push(inCwd(inp.command));
      break;
    case "exited_before_ready":
    case "service_died":
      if (log)
        t.push(log);
      if (missingTool)
        t.push(`witness check --stage boot${svc ? ` --service ${svc}` : ""}   # without --no-setup, so setup runs again`);
      else if (inp.command)
        t.push(inCwd(inp.command));
      if (d.cause === "service_died")
        t.push(`witness check --stage boot${svc ? ` --service ${svc}` : ""}`);
      break;
    case "ready_timeout":
      if (inp.url)
        t.push(`curl -i ${inp.url}`);
      if (log)
        t.push(log);
      if (inp.steadyStatus)
        t.push(`the app answers HTTP ${inp.steadyStatus} at the ready URL, so it is up but the URL ${inp.steadyStatus === 404 ? "does not exist" : "is refused"}: fix ready.http (or ready.status) for service ${svc ?? ""}; a longer timeout will not help`.trim());
      else
        t.push(`raise ready.timeout for service ${svc ?? ""}`.trim());
      break;
    case "port_in_use":
      if (inp.port)
        t.push(`lsof -nP -iTCP:${inp.port} -sTCP:LISTEN`);
      t.push("witness down   # if a previous `witness up` still holds the port");
      if (svc)
        t.push(`set ports = "<free range>" for service ${svc}, and make start use \${PORT}`);
      break;
    case "auth_failed":
      t.push("check the credentials in .witness/.env (or the env the service reads)");
      if (log)
        t.push(log);
      break;
    case "network":
      t.push("check DNS / VPN / proxy; the failing host is in the evidence line");
      if (log)
        t.push(log);
      break;
    case "suite_timeout":
      if (log)
        t.push(log);
      t.push(`raise timeout for suite ${inp.suite ?? ""}, or run part of it: witness run --suite ${inp.suite ?? "<suite>"} --select <test-id>`);
      break;
    case "stalled":
      if (log)
        t.push(log);
      if (inp.perTestTimeout !== false)
        t.push(`set per_test_timeout for suite ${inp.suite ?? ""} so a hung test fails instead of hanging`);
      else if (inp.adapter === "dotnet")
        t.push(`per_test_timeout does nothing for this dotnet project (Microsoft.Testing.Platform); to name the hung test add the Microsoft.Testing.Extensions.HangDump package and append --hangdump --hangdump-timeout 5m to the suite cmd`);
      if (inp.perTestTimeout === false)
        t.push(`narrow it down: witness run --suite ${inp.suite ?? "<suite>"} --select <test-id>,...`);
      t.push("raise [run] stall_timeout if the suite is legitimately quiet for long");
      break;
    case "report_missing":
      if (log)
        t.push(log);
      if (missingTool && inp.command)
        t.push(inCwd(inp.command));
      t.push(`check that suite ${inp.suite ?? ""} writes its report (adapter args, or set report = "<glob>")`);
      break;
    case "report_unreadable":
      t.push(`inspect the raw report under reports/${inp.suite ?? ""}/ (truncated or not a test report)`);
      if (log)
        t.push(log);
      break;
    case "report_incomplete":
      if (log)
        t.push(log);
      t.push("the suite exited non-zero or left out tests although its report shows no failures; look for errors outside tests (teardown, coverage thresholds, crashed workers)");
      break;
  }
  for (const x of inp.extraTry ?? [])
    t.push(x);
  return t;
}
function formatDiagnosis(d) {
  const where = [d.stage, d.service && `service ${d.service}`, d.suite && `suite ${d.suite}`].filter(Boolean).join(", ");
  const out = [`cause: ${d.cause} (${where})${d.retryable ? " · retryable" : ""}`];
  if (d.env_missing?.length)
    out.push(`missing: ${d.env_missing.join(", ")}`);
  if (d.command)
    out.push(`command: ${d.command}`);
  if (d.evidence)
    out.push(`evidence: ${d.evidence}`);
  if (d.log)
    out.push(`log: ${d.log}`);
  for (const t of d.try)
    out.push(`try: ${t}`);
  return out;
}

// src/listing.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";

// src/parsers/index.ts
import * as fs4 from "node:fs";

// src/parsers/types.ts
class ReportError extends Error {
}
function failureSummary(text, maxLines = 6) {
  if (!text)
    return;
  const out = [];
  for (const raw of text.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    if (/^\s*Call log:/.test(raw))
      break;
    if (!raw.trim() || /^\s+at\s|^\s*at .+:\d+:\d+\)?$/.test(raw))
      continue;
    out.push(raw.trimEnd());
    if (out.length >= maxLines)
      break;
  }
  return out.join(`
`).slice(0, 2000) || undefined;
}

// src/parsers/gotest.ts
var NEVER_FINISHED = "test started but never finished (binary crashed, timed out or was killed)";
function parseGoJson(text, info = {}) {
  const tests = new Map;
  const pkgOut = new Map;
  const pkgEnd = new Map;
  let events = 0;
  for (const [n, line] of text.split(/\r?\n/).entries()) {
    const l = line.trim();
    if (!l.startsWith("{"))
      continue;
    let e;
    try {
      e = JSON.parse(l);
    } catch {
      if (/^\{"(Time|Action)"/.test(l))
        info.cut = `go test -json output cut off at line ${n + 1}`;
      continue;
    }
    if (!e.Action)
      continue;
    events++;
    const pkg = e.Package ?? "";
    if (!e.Test) {
      if (e.Action === "output")
        (pkgOut.get(pkg) ?? pkgOut.set(pkg, []).get(pkg)).push(e.Output ?? "");
      else if (["pass", "fail", "skip"].includes(e.Action))
        pkgEnd.set(pkg, e.Action);
      continue;
    }
    const key = `${pkg}#${e.Test}`;
    let t = tests.get(key);
    if (!t) {
      t = { name: e.Test, classname: pkg, status: "other", durationMs: 0, out: [], done: false };
      tests.set(key, t);
    }
    if (e.Action === "output")
      t.out.push(e.Output ?? "");
    else if (e.Action === "pass" || e.Action === "fail" || e.Action === "skip") {
      t.status = e.Action === "pass" ? "passed" : e.Action === "fail" ? "failed" : "skipped";
      t.durationMs = Math.round((e.Elapsed ?? 0) * 1000);
      t.done = true;
    }
  }
  if (events === 0)
    throw new ReportError("no go test -json events found");
  const out = [];
  for (const t of tests.values()) {
    const { out: lines, done, ...c } = t;
    if (!done) {
      c.status = "failed";
      c.statusDetail = /panic: test timed out/.test([...lines, ...pkgOut.get(c.classname) ?? []].join("")) ? "timeout" : "error";
      c.message = c.statusDetail === "timeout" ? lines.find((x) => /panic: test timed out/.test(x))?.trim() ?? NEVER_FINISHED : NEVER_FINISHED;
    }
    if (c.status === "failed") {
      const body = lines.filter((x) => !/^(=== |--- |\s*$)/.test(x)).join("");
      c.message = c.message ?? (body.trim().split(`
`)[0]?.trim().slice(0, 2000) || undefined);
      if (body.trim())
        c.trace = body.slice(0, 20000);
    }
    out.push(c);
  }
  for (const [pkg, end] of pkgEnd) {
    const has = out.some((c) => c.classname === pkg);
    if (end === "fail" && !out.some((c) => c.classname === pkg && c.status === "failed")) {
      const body = (pkgOut.get(pkg) ?? []).join("");
      out.push({ name: "(package)", classname: pkg, status: "failed", statusDetail: "error", durationMs: 0, message: has ? "package failed outside any test" : "package failed to build or run", trace: body.slice(0, 20000) || undefined });
    }
  }
  return out;
}

// src/parsers/jest.ts
var MAP = { passed: "passed", failed: "failed", pending: "skipped", skipped: "skipped", disabled: "skipped", todo: "pending", focused: "passed" };
var stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
function parseJestJson(json, cwd) {
  const doc = json;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.testResults))
    throw new ReportError("not a Jest JSON report (no testResults)");
  const out = [];
  for (const f of doc.testResults) {
    const file = f.name && cwd && f.name.startsWith(cwd + "/") ? f.name.slice(cwd.length + 1) : f.name;
    const asserts = f.assertionResults ?? [];
    if (!asserts.length && f.status === "failed") {
      out.push({ name: "(test file failed to run)", file, titles: ["(test file failed to run)"], status: "failed", statusDetail: "error", durationMs: 0, message: stripAnsi(f.message ?? "").split(`
`).map((l) => l.trim()).find((l) => l && !l.startsWith("●")), trace: stripAnsi(f.message ?? "").slice(0, 20000) });
      continue;
    }
    for (const a of asserts) {
      const fail = (a.failureMessages ?? []).map(stripAnsi).join(`
`);
      out.push({
        name: a.title ?? "(unnamed)",
        file,
        titles: [...a.ancestorTitles ?? [], a.title ?? "(unnamed)"],
        status: MAP[a.status ?? ""] ?? "other",
        durationMs: a.duration ?? 0,
        message: failureSummary(fail),
        trace: fail ? fail.slice(0, 20000) : undefined,
        retries: a.invocations && a.invocations > 1 ? a.invocations - 1 : undefined,
        flaky: a.invocations && a.invocations > 1 && a.status === "passed" ? true : undefined
      });
    }
  }
  return out;
}

// src/parsers/junit.ts
var import_fast_xml_parser = __toESM(require_fxp(), 1);
var ARRAYS = new Set(["testsuite", "testcase", "failure", "error", "skipped", "flakyFailure", "flakyError", "rerunFailure", "rerunError", "property", "system-out"]);
var xmlParser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ARRAYS.has(name)
});
function parseXml(xml) {
  const body = xml.replace(/^﻿/, "").trim();
  if (!body)
    throw new ReportError("empty report");
  const v = import_fast_xml_parser.XMLValidator.validate(body);
  if (v !== true) {
    const open = /^Invalid '\[(.*)\]' found/s.exec(v.err.msg);
    const what = open ? `truncated: unclosed ${open[1].replace(/\s+/g, "").replace(/"/g, "").split(",").map((t) => `<${t}>`).join(" ")}` : v.err.msg;
    throw new ReportError(`invalid XML at line ${v.err.line}: ${what}`);
  }
  return xmlParser.parse(body);
}
function attr(n, k) {
  if (!n || typeof n !== "object")
    return;
  const v = n[`@_${k}`];
  return v == null ? undefined : String(v);
}
function textOf(n) {
  if (n == null)
    return "";
  if (typeof n === "string" || typeof n === "number")
    return String(n);
  const t = n["#text"];
  return t == null ? "" : String(t);
}
var secToMs = (v) => {
  const n = Number(String(v ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
};
function attachmentsFrom(out) {
  const res = [];
  for (const m of out.matchAll(/\[\[ATTACHMENT\|([^\]]+)\]\]/g))
    res.push({ name: m[1].split(/[\\/]/).pop(), path: m[1].trim(), contentType: "" });
  return res;
}
function caseFrom(tc, suite) {
  const failures = arr(tc.failure);
  const errors = arr(tc.error);
  const skipped = arr(tc.skipped);
  const flaky = [...arr(tc.flakyFailure), ...arr(tc.flakyError)];
  const reruns = [...arr(tc.rerunFailure), ...arr(tc.rerunError)];
  const out = arr(tc["system-out"]).map(textOf).join(`
`);
  const c = {
    name: attr(tc, "name") ?? "(unnamed)",
    classname: attr(tc, "class") ?? attr(tc, "classname") ?? attr(suite, "name"),
    file: attr(tc, "file") ?? attr(suite, "file"),
    line: attr(tc, "line") ? Number(attr(tc, "line")) : undefined,
    status: "passed",
    durationMs: secToMs(attr(tc, "time"))
  };
  const bad = failures[0] ?? errors[0];
  if (bad !== undefined) {
    c.status = "failed";
    if (failures.length === 0)
      c.statusDetail = "error";
    c.message = (attr(bad, "message") ?? failureSummary(textOf(bad)) ?? "").slice(0, 2000) || undefined;
    const trace = textOf(bad).trim();
    if (trace)
      c.trace = trace.slice(0, 20000);
    if (/Timeout/.test(attr(bad, "type") ?? "") || /timed out|timeout of \d+|timeout \d+ ?ms exceeded/i.test(c.message ?? ""))
      c.statusDetail = "timeout";
    if (reruns.length)
      c.retries = reruns.length;
  } else if (skipped.length) {
    c.status = "skipped";
    c.message = attr(skipped[0], "message") ?? (textOf(skipped[0]).trim() || undefined);
  } else if (flaky.length) {
    c.flaky = true;
    c.retries = flaky.length;
    c.message = attr(flaky[0], "message");
  }
  const atts = attachmentsFrom(out);
  if (atts.length)
    c.attachments = atts;
  return c;
}
function parseJUnit(xml) {
  const doc = parseXml(xml);
  if (!("testsuites" in doc) && !("testsuite" in doc) && !("testcase" in doc))
    throw new ReportError("not a JUnit report (no <testsuites>, <testsuite> or <testcase>)");
  const out = [];
  const walk = (suite) => {
    for (const tc of arr(suite.testcase))
      out.push(caseFrom(typeof tc === "object" && tc ? tc : {}, suite));
    for (const s of arr(suite.testsuite))
      if (s && typeof s === "object")
        walk(s);
  };
  const roots = doc.testsuites;
  for (const r of arr(roots))
    if (r && typeof r === "object")
      walk(r);
  walk(doc);
  return out;
}

// src/parsers/playwright.ts
var stripAnsi2 = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
function parsePlaywright(json) {
  const doc = json;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.suites))
    throw new ReportError("not a Playwright JSON report (no suites)");
  const rows = [];
  const walk = (s, titles, file) => {
    const f = s.file ?? file;
    const here = f && s.title === f && titles.length === 0 ? titles : s.title ? [...titles, s.title] : titles;
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1];
        const st = t.status ?? "";
        const c = {
          name: spec.title ?? "(unnamed)",
          file: spec.file ?? f,
          titles: [...here, spec.title ?? "(unnamed)"],
          line: spec.line,
          status: "other",
          durationMs: results.reduce((a, r) => a + (r.duration ?? 0), 0),
          _project: t.projectName ?? ""
        };
        if (st === "skipped" || t.expectedStatus === "skipped" || last?.status === "skipped")
          c.status = "skipped";
        else if (st === "expected")
          c.status = "passed";
        else if (st === "flaky") {
          c.status = "passed";
          c.flaky = true;
        } else if (st === "unexpected") {
          c.status = "failed";
          if (last?.status === "timedOut")
            c.statusDetail = "timeout";
          else if (last?.status === "interrupted")
            c.statusDetail = "error";
        } else if (last?.status === "passed")
          c.status = "passed";
        else if (last?.status === "failed" || last?.status === "timedOut")
          c.status = "failed";
        if (results.length > 1)
          c.retries = results.length - 1;
        const err = [...results].reverse().find((r) => r.error || r.errors?.length);
        const e = err?.error ?? err?.errors?.[0];
        if (e && c.status !== "passed") {
          c.message = failureSummary(e.message);
          if (e.stack || e.message)
            c.trace = stripAnsi2(e.stack ?? e.message ?? "").slice(0, 20000);
        }
        const atts = [];
        for (const r of results)
          for (const a of r.attachments ?? [])
            if (a.path)
              atts.push({ name: a.name ?? "", path: a.path, contentType: a.contentType ?? "" });
        if (atts.length)
          c.attachments = atts;
        rows.push(c);
      }
    }
    for (const sub of s.suites ?? [])
      walk(sub, here, f);
  };
  for (const s of doc.suites)
    walk(s, [], undefined);
  const multi = new Set(rows.map((r) => r._project)).size > 1;
  return rows.map(({ _project, ...c }) => multi && _project ? { ...c, project: _project } : c);
}

// src/parsers/trx.ts
function durMs(v) {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(v ?? "");
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : 0;
}
var OUTCOME = {
  passed: ["passed"],
  passedbutrunaborted: ["passed"],
  warning: ["passed"],
  failed: ["failed"],
  error: ["failed", "error"],
  aborted: ["failed", "error"],
  timeout: ["failed", "timeout"],
  notexecuted: ["skipped"],
  notrunnable: ["skipped"],
  inconclusive: ["other"],
  pending: ["pending"],
  inprogress: ["other"],
  disconnected: ["other", "error"],
  completed: ["passed"]
};
function one(n) {
  const a = arr(n);
  return a[0] && typeof a[0] === "object" ? a[0] : undefined;
}
function parseTrx(xml) {
  const doc = parseXml(xml);
  const run = one(doc.TestRun);
  if (!run)
    throw new ReportError("not a TRX report (no <TestRun>)");
  const classes = new Map;
  for (const ut of arr(one(run.TestDefinitions)?.UnitTest)) {
    const tm = one(ut.TestMethod);
    const cls = attr(tm, "className");
    if (cls)
      classes.set(attr(ut, "id") ?? "", cls.split(",")[0].trim());
  }
  const out = [];
  const add = (r) => {
    const inner = arr(one(r.InnerResults)?.UnitTestResult);
    if (inner.length) {
      inner.forEach(add);
      return;
    }
    const [status, detail] = OUTCOME[(attr(r, "outcome") ?? "").toLowerCase()] ?? ["other"];
    const info = one(one(r.Output)?.ErrorInfo);
    const message = textOf(one(info?.Message) ?? info?.Message).trim();
    const trace = textOf(one(info?.StackTrace) ?? info?.StackTrace).trim();
    out.push({
      name: attr(r, "testName") ?? "(unnamed)",
      classname: classes.get(attr(r, "testId") ?? ""),
      status,
      statusDetail: detail,
      durationMs: durMs(attr(r, "duration")),
      message: message ? message.slice(0, 2000) : undefined,
      trace: trace ? trace.slice(0, 20000) : undefined
    });
  };
  for (const r of arr(one(run.Results)?.UnitTestResult))
    add(r);
  return out;
}

// src/parsers/index.ts
function parseReportText(text, hint, cwd) {
  const body = text.replace(/^﻿/, "").trim();
  if (!body)
    throw new ReportError("empty report");
  if (hint === "go-json") {
    const info = {};
    return { format: "go-json", cases: parseGoJson(body, info), partial: info.cut };
  }
  if (body.startsWith("<")) {
    if (/<TestRun[\s>]/.test(body.slice(0, 4000)))
      return { format: "trx", cases: parseTrx(body) };
    return { format: "junit", cases: parseJUnit(body) };
  }
  if (body.startsWith("{") || body.startsWith("[")) {
    let doc;
    try {
      doc = JSON.parse(body);
    } catch (e) {
      if (/^\{"(Time|Action)"/.test(body))
        return { format: "go-json", cases: parseGoJson(body) };
      throw new ReportError(`invalid JSON: ${e.message}`);
    }
    const o = doc;
    if (o && typeof o === "object" && "testResults" in o)
      return { format: "jest-json", cases: parseJestJson(o, cwd) };
    if (o && typeof o === "object" && "suites" in o)
      return { format: "playwright-json", cases: parsePlaywright(o) };
    if (o && typeof o === "object" && "Action" in o)
      return { format: "go-json", cases: parseGoJson(body) };
    throw new ReportError("unrecognised JSON report");
  }
  throw new ReportError("unrecognised report format");
}
function parseReportFile(file, hint, cwd) {
  try {
    const { format, cases, partial } = parseReportText(fs4.readFileSync(file, "utf8"), hint, cwd);
    return partial ? { file, format, cases, partial } : { file, format, cases };
  } catch (e) {
    return { file, cases: [], error: e instanceof ReportError ? e.message : `unreadable: ${e.message}` };
  }
}

// src/proc.ts
import { spawn } from "node:child_process";
import * as fs5 from "node:fs";
import * as net from "node:net";
import * as path4 from "node:path";
var SCRUB = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY"];
function childEnv(base, extra = {}) {
  const env = { ...base, ...extra };
  for (const k of SCRUB)
    if (!(k in extra))
      delete env[k];
  return env;
}
function spawnGroup(cmd, opts) {
  fs5.mkdirSync(path4.dirname(opts.log), { recursive: true });
  const fd = fs5.openSync(opts.log, "a");
  fs5.writeSync(fd, `$ ${cmd}
`);
  const child = spawn("bash", ["-c", cmd], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", fd, fd], detached: true });
  fs5.closeSync(fd);
  const p = {
    name: opts.name,
    pid: child.pid ?? -1,
    pgid: child.pid ?? -1,
    child,
    log: opts.log,
    exited: false,
    code: null,
    exit: new Promise((resolve3) => {
      child.on("error", (e) => {
        fs5.appendFileSync(opts.log, `witness: failed to start: ${e.message}
`);
        p.exited = true;
        p.code = 127;
        resolve3({ code: 127, signal: null });
      });
      child.on("exit", (code, signal) => {
        p.exited = true;
        p.code = code ?? (signal ? 128 : 1);
        resolve3({ code: p.code, signal });
      });
    })
  };
  return p;
}
function groupAlive(pgid) {
  if (!pgid || pgid <= 1)
    return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
async function killGroup(pgid, graceMs) {
  if (!groupAlive(pgid))
    return "gone";
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    return "gone";
  }
  const until = Date.now() + graceMs;
  while (Date.now() < until) {
    await sleep(100);
    if (!groupAlive(pgid))
      return "terminated";
  }
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {}
  for (let i = 0;i < 20 && groupAlive(pgid); i++)
    await sleep(50);
  return "killed";
}
async function runCapture(cmd, opts) {
  const child = spawn("bash", ["-c", cmd], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  if (child.pid)
    opts.track?.(child.pid, true);
  const chunks = [];
  child.stdout?.on("data", (d) => chunks.push(d));
  child.stderr?.on("data", (d) => chunks.push(d));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid)
      killGroup(child.pid, 2000);
  }, opts.timeoutMs);
  const abortPoll = opts.abort ? setInterval(() => opts.abort.aborted && child.pid && void killGroup(child.pid, 2000), 200) : undefined;
  const code = await new Promise((resolve3) => {
    child.on("error", () => resolve3(127));
    child.on("close", (c) => resolve3(c));
  });
  clearTimeout(timer);
  clearInterval(abortPoll);
  if (child.pid)
    opts.track?.(child.pid, false);
  const out = Buffer.concat(chunks).toString("utf8");
  if (opts.log) {
    fs5.mkdirSync(path4.dirname(opts.log), { recursive: true });
    fs5.appendFileSync(opts.log, `$ ${cmd}
${out}${out.endsWith(`
`) || !out ? "" : `
`}`);
  }
  return { code: timedOut ? null : code, out, timedOut };
}
async function httpProbe(url, status, timeoutMs = 3000) {
  let u;
  try {
    u = new URL(url);
  } catch {
    u = undefined;
  }
  if (u?.hostname !== "localhost")
    return probeOnce(url, status, timeoutMs);
  const v4 = new URL(url);
  v4.hostname = "127.0.0.1";
  const a = await probeOnce(v4.href, status, timeoutMs);
  if (a.ok)
    return a;
  const v6 = new URL(url);
  v6.hostname = "[::1]";
  const b = await probeOnce(v6.href, status, timeoutMs);
  if (b.ok)
    return b;
  return /^HTTP/.test(a.detail) || !/^HTTP/.test(b.detail) ? a : b;
}
async function probeOnce(url, status, timeoutMs = 3000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    await r.body?.cancel().catch(() => {});
    const ok = status ? r.status === status : r.status < 400;
    return { ok, detail: `HTTP ${r.status}` };
  } catch (e) {
    const err = e;
    return { ok: false, detail: err.cause?.code ?? err.cause?.message ?? err.message };
  }
}
function portAnswers(host, port, timeoutMs = 1000) {
  return new Promise((resolve3) => {
    const sock = net.connect({ host, port });
    const done = (v) => {
      sock.destroy();
      resolve3(v);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}
function portFree(port) {
  return new Promise((resolve3) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve3(false));
    srv.listen({ port, host: "0.0.0.0", exclusive: true }, () => {
      srv.close(() => {
        const s2 = net.createServer();
        s2.unref();
        s2.once("error", () => resolve3(false));
        s2.listen({ port, host: "127.0.0.1", exclusive: true }, () => s2.close(() => resolve3(true)));
      });
    });
  });
}
function anyFreePort() {
  return new Promise((resolve3, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve3(port));
    });
  });
}
async function allocatePort(pool, taken) {
  if (pool) {
    for (let p = pool[0];p <= pool[1]; p++)
      if (!taken.has(p) && await portFree(p))
        return { port: p };
    return { tried: pool[0] === pool[1] ? `port ${pool[0]} is already in use` : `ports ${pool[0]}-${pool[1]} are all in use` };
  }
  for (let i = 0;i < 20; i++) {
    const p = await anyFreePort();
    if (!taken.has(p))
      return { port: p };
  }
  return { tried: "no free port found" };
}

// src/reconcile.ts
import * as path5 from "node:path";
var SETUP_FAILURE = /fixture type .* threw|threw in InitializeAsync|OneTimeSetUp|"before all" hook|beforeAll hook|setUpClass|error in fixture setup|failed on setup/i;
var TEST_TIMEOUT = /^Failed: Timeout \(?>[\d.]+s|Exceeded timeout of \d+ ?ms for a test|Timeout of \d+ms exceeded|Test timeout of \d+ms exceeded|Test timed out in \d+ms|execution timed out after \d+|timed out after \d+ (?:ms|milliseconds|seconds)|Execution aborted after \d+ seconds?|panic: test timed out after/i;
var cleanId = (adapter, id) => id.startsWith(`${adapter.name}:`) ? id.slice(adapter.name.length + 1) : id;
function toRecord(c, adapter, suite, cwd, obtained = "report") {
  const file = normFile(c.file, cwd);
  const raw = { ...c, file };
  const local = adapter.id(raw);
  const r = { id: stableId(adapter.name, local), name: local, suite, adapter: adapter.name, status: c.status, durationMs: c.durationMs, obtained };
  if (c.statusDetail)
    r.statusDetail = c.statusDetail;
  else if (c.status === "failed" && SETUP_FAILURE.test(c.message ?? ""))
    r.statusDetail = "error";
  else if (c.status === "failed" && TEST_TIMEOUT.test(`${c.message ?? ""}
${(c.trace ?? "").slice(0, 2000)}`))
    r.statusDetail = "timeout";
  if (c.message)
    r.message = c.message;
  if (c.trace)
    r.trace = c.trace;
  if (file)
    r.filePath = file;
  if (c.retries)
    r.retries = c.retries;
  if (c.flaky)
    r.flaky = true;
  if (c.attachments?.length)
    r.attachments = c.attachments.map((a) => ({ ...a, path: path5.isAbsolute(a.path) ? a.path : path5.join(cwd, a.path) }));
  return r;
}
function dedupe(tests) {
  const m = new Map;
  for (const t of tests) {
    const prev = m.get(t.id);
    if (!prev) {
      m.set(t.id, t);
      continue;
    }
    const merged = { ...t, retries: (prev.retries ?? 0) + (t.retries ?? 0) + 1 };
    if (t.status === "passed" && prev.status === "failed")
      merged.flaky = true;
    merged.attachments = [...prev.attachments ?? [], ...t.attachments ?? []];
    if (!merged.attachments.length)
      delete merged.attachments;
    m.set(t.id, merged);
  }
  return [...m.values()];
}
function summarize(name, state, tests) {
  const s = { name, state, passed: 0, failed: 0, skipped: 0, error: 0, missing: 0 };
  for (const t of tests) {
    if (t.status === "passed")
      s.passed++;
    else if (t.status === "skipped" || t.status === "pending")
      s.skipped++;
    else if (t.status === "failed" && !t.statusDetail)
      s.failed++;
    else if (t.statusDetail === "missing")
      s.missing++;
    else
      s.error++;
  }
  return s;
}
function suiteLevel(adapter, suite, exitCode, message, exitCodeOnly = false) {
  const ok = exitCode === 0;
  const r = { id: stableId(adapter.name, `(suite ${suite})`), name: suite, suite, adapter: adapter.name, status: ok ? exitCodeOnly ? "passed" : "other" : "failed", durationMs: 0, obtained: "suite-level", message };
  if (!exitCodeOnly)
    r.statusDetail = ok ? "missing" : "error";
  return r;
}
function presentIn(ids, id) {
  if (ids.has(id))
    return true;
  for (const x of ids)
    if (x.startsWith(`${id}(`) || x.startsWith(`${id} (`) || x.startsWith(`${id}[`))
      return true;
  return false;
}
function reconcile(inp) {
  const { adapter, suite, exitCode, end, cwd } = inp;
  const unreadable = inp.files.filter((f) => f.error);
  let tests = dedupe(inp.files.flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite, cwd))));
  const expected = (inp.expected ?? []).map((id) => stableId(adapter.name, cleanId(adapter, id)));
  if (inp.selected && expected.length) {
    const want = new Set(expected);
    tests = tests.filter((t) => t.status !== "skipped" && t.status !== "pending" || [...want].some((id) => presentIn(new Set([t.id]), id)));
  }
  if (end === "interrupted" || end === "service_died" || end === "timeout" || end === "stalled") {
    const have = new Set(tests.map((t) => t.id));
    for (const id of expected)
      if (!presentIn(have, id))
        tests.push(missing(id, adapter, suite, end === "timeout" || end === "stalled" ? "timeout" : "missing"));
    const state = end === "interrupted" ? "interrupted" : end === "service_died" ? "error" : end === "timeout" ? "timeout" : "stalled";
    const cause2 = end === "service_died" ? "service_died" : end === "timeout" ? "suite_timeout" : end === "stalled" ? "stalled" : undefined;
    if (!tests.length && end !== "interrupted")
      tests = [{ ...suiteLevel(adapter, suite, 1, `suite ${end === "service_died" ? "aborted: a service died" : end}`), statusDetail: end === "service_died" ? "error" : "timeout" }];
    return { tests, state, cause: cause2 };
  }
  if (tests.length) {
    const have = new Set(tests.map((t) => t.id));
    const absent = expected.filter((id) => !presentIn(have, id));
    const partial = inp.files.find((f) => f.partial)?.partial ?? unreadable[0]?.error;
    const unfinished = inp.files.some((f) => f.partial) ? tests.filter((t) => t.message === NEVER_FINISHED).map((t) => t.id) : [];
    if (partial && (absent.length || unfinished.length)) {
      const redo = [...absent, ...unfinished];
      return { tests: tests.filter((t) => !unfinished.includes(t.id)), state: "error", cause: "report_unreadable", note: `report partly unreadable (${partial}); ${redo.length} test(s) not in its readable part`, rerun: redo.map((id) => id.slice(adapter.name.length + 1)) };
    }
    for (const id of absent)
      tests.push(missing(id, adapter, suite, "missing"));
    const failed = tests.filter((t) => t.status === "failed");
    if (failed.length && failed.every((t) => t.statusDetail === "error")) {
      const lines = (failed[0].message ?? "").split(`
`).map((l) => l.replace(/^[-\s]+/, "").trim()).filter(Boolean);
      const inner = lines.slice(1).find((l) => /exception|error|did not|timed? ?out|refused|not found/i.test(l));
      return { tests, state: "error", cause: "setup_failed", note: `${failed.length} test(s) errored in fixture setup; none failed its own checks`, evidence: [lines[0], inner].filter(Boolean).join(" · ").slice(0, 500), hint: "a test fixture's setup failed (it starts a browser, app, container or database), so no test ran its own checks: fix what the fixture needs, then run the suite again" };
    }
    if (failed.length)
      return { tests, state: "failed", note: unreadable.length ? `${unreadable.length} report file(s) unreadable` : undefined };
    if (exitCode !== 0)
      return { tests, state: "error", cause: "report_incomplete", note: `exit code ${exitCode} but the report shows no failures` };
    if (absent.length)
      return { tests, state: "error", cause: "report_incomplete", note: `${absent.length} expected test(s) missing from the report` };
    if (unreadable.length)
      return { tests, state: "error", cause: "report_unreadable", note: `${unreadable.length} report file(s) unreadable: ${unreadable[0].error}` };
    if (tests.every((t) => t.status === "skipped" || t.status === "pending"))
      return { tests, state: "error", cause: "report_incomplete", note: `all ${tests.length} test(s) were skipped; nothing was checked`, hint: "every test was skipped: look for a skip condition that fired (a fixture that skips when the app or a dependency is unreachable, a missing marker or env var)" };
    return { tests, state: "passed" };
  }
  if (inp.exitCodeOnly) {
    return { tests: [suiteLevel(adapter, suite, exitCode, `exit code ${exitCode}`, true)], state: exitCode === 0 ? "passed" : "failed" };
  }
  const cause = unreadable.length ? "report_unreadable" : "report_missing";
  const note = unreadable.length ? `report unreadable: ${unreadable[0].error}` : inp.files.length ? "report lists no tests" : "no report written";
  if (expected.length)
    return { tests: [], state: "error", cause, note, rerun: expected.map((id) => cleanId(adapter, id.slice(adapter.name.length + 1))) };
  return { tests: [suiteLevel(adapter, suite, exitCode, `${note}; exit code ${exitCode}`)], state: "error", cause, note };
}
function missing(id, adapter, suite, detail, message) {
  return { id, name: id.slice(adapter.name.length + 1), suite, adapter: adapter.name, status: "other", statusDetail: detail, durationMs: 0, obtained: "report", message: message ?? (detail === "timeout" ? "did not finish before the suite was stopped" : "expected but absent from the report") };
}
function fromReruns(results, adapter, suite, cwd, originalExit, cause, fromLastReport) {
  const tests = [];
  for (const r of results) {
    const sid = stableId(adapter.name, r.id);
    const cases = r.files.flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite, cwd, "per-test-rerun")));
    const exact = cases.find((c) => c.id === sid);
    const params = cases.filter((c) => presentIn(new Set([c.id]), sid));
    const hit = exact ?? (params.length ? { ...params[0], id: sid, status: params.some((c) => c.status === "failed") ? "failed" : params[0].status } : cases.length === 1 ? { ...cases[0], id: sid } : undefined);
    if (hit)
      tests.push(hit);
    else if (fromLastReport && !r.timedOut) {
      tests.push({ id: sid, name: r.id, suite, adapter: adapter.name, status: "other", statusDetail: "missing", durationMs: 0, obtained: "per-test-rerun", message: `run alone: exit code ${r.exitCode} and not in its report; the id comes from an earlier report (${fromLastReport.replace(/^list: /, "")}), so the test may have been renamed or deleted` });
    } else if (r.timedOut || r.exitCode !== 0) {
      const t = { id: sid, name: r.id, suite, adapter: adapter.name, status: "failed", durationMs: 0, obtained: "per-test-rerun", message: r.timedOut ? "timed out when run alone" : `run alone: exit code ${r.exitCode}` };
      if (r.timedOut)
        t.statusDetail = "timeout";
      tests.push(t);
    } else {
      tests.push({ id: sid, name: r.id, suite, adapter: adapter.name, status: "other", statusDetail: "missing", durationMs: 0, obtained: "per-test-rerun", message: "run alone: exit code 0 but the test is not in its report (the filter may have matched nothing)" });
    }
  }
  const failed = tests.some((t) => t.status === "failed");
  if (failed)
    return { tests, state: "failed", cause, note: "suite report unusable; tests rerun one by one" };
  if (tests.some((t) => t.status === "other"))
    return { tests, state: "error", cause, note: "suite report unusable; some tests rerun alone are missing from their reports" };
  if (originalExit !== 0)
    return { tests, state: "error", cause: "report_incomplete", note: `suite exited ${originalExit} without a usable report, but each test passes alone` };
  return { tests, state: "passed", cause, note: "suite report unusable; tests rerun one by one" };
}
var RANK = { passed: 0, failed: 1, error: 2, stalled: 3, mistrial: 4, interrupted: 5 };
function worst(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}
function suiteOutcome(s) {
  switch (s.state) {
    case "passed":
    case "skipped":
      return "passed";
    case "failed":
      return "failed";
    case "stalled":
    case "timeout":
      return "stalled";
    case "interrupted":
      return "interrupted";
    case "error":
      return s.cause === "service_died" ? "mistrial" : "error";
    default:
      return "error";
  }
}
var EXIT = { passed: 0, failed: 1, error: 2, mistrial: 3, stalled: 4, interrupted: 5 };
function applyParity(target, origin) {
  const o = new Map(origin.map((t) => [t.id, t]));
  const counts = { same: 0, differs: 0, origin_only: 0, target_only: 0 };
  const out = target.map((t) => {
    const ot = o.get(t.id);
    o.delete(t.id);
    if (!ot) {
      counts.target_only++;
      return { ...t, parity: "target_only" };
    }
    const p = ot.status === t.status ? "same" : "differs";
    counts[p]++;
    return { ...t, parity: p, originStatus: ot.status };
  });
  for (const ot of o.values()) {
    if (ot.obtained === "suite-level")
      continue;
    counts.origin_only++;
    out.push({ id: ot.id, name: ot.name, suite: ot.suite, adapter: ot.adapter, status: "other", statusDetail: "missing", durationMs: 0, obtained: ot.obtained, filePath: ot.filePath, parity: "origin_only", originStatus: ot.status, message: "present on the origin, absent on the target" });
  }
  return { tests: out, counts };
}

// src/listing.ts
var cacheFile = (root, suite) => path6.join(root, ".witness", "cache", "tests", `${suite}.json`);
var suiteKey = (s) => sha(JSON.stringify([s.adapter, s.cwd]));
function readListCache(root, suite) {
  const c = readJson(cacheFile(root, suite.name), null);
  return c && Array.isArray(c.ids) && c.ids.length ? c : undefined;
}
function writeListCache(root, suite, runId, commit, ids) {
  if (!ids.length)
    return;
  try {
    writeJson(cacheFile(root, suite.name), { suite: suite.name, key: suiteKey(suite), run_id: runId, commit, at: new Date().toISOString(), ids: [...new Set(ids)] });
  } catch {}
}
function listCommand(suite, adapter, vars, reportDir, cwd) {
  const v = { ...vars, WITNESS_REPORT_DIR: reportDir };
  if (suite.list)
    return { cmd: fillSelect(substitute(suite.list.cmd, v)), format: suite.list.format, source: "template", report: suite.list.report && substitute(suite.list.report, v) };
  const nl = adapter.list;
  if (!nl)
    return null;
  let cmd = substitute(suite.cmd, v);
  if (nl.rewrite)
    cmd = nl.rewrite(cmd);
  if (!cmd)
    return null;
  if (nl.args)
    cmd = addArgs(cmd, nl.args);
  if (nl.format === "report") {
    if (!adapter.reportArgs || suite.report || adapter.reportMarker && adapter.reportMarker.test(cmd))
      return null;
    cmd = addArgs(cmd, adapter.reportArgs(reportDir, cwd, cmd));
  }
  return { cmd: fillSelect(cmd), format: nl.format, source: "native" };
}
var CLASS_HASH = new Set(["dotnet", "junit-maven", "junit-gradle", "phpunit", "generic"]);
function parseListing(lc, adapter, out, reportDir, cwd) {
  if (lc.format === "lines")
    return [...new Set(out.split(/\r?\n/).map((l) => l.trim().replace(new RegExp(`^${adapter.name}:`), "")).filter((l) => l && !l.startsWith("#")))];
  if (lc.format === "adapter")
    return adapter.list?.parse?.(out) ?? [];
  const files = globFiles(reportDir, ["**/*.{xml,trx,json}"]).map((f) => path6.join(reportDir, f));
  if (lc.report) {
    const abs = path6.isAbsolute(lc.report);
    const base = abs ? path6.dirname(lc.report) : cwd;
    files.push(...globFiles(base, [abs ? path6.basename(lc.report) : lc.report]).map((f) => path6.join(base, f)));
  }
  const ids = files.flatMap((f) => parseReportFile(f, adapter.format, cwd).cases.map((c) => toRecord(c, adapter, "list", cwd).name));
  return [...new Set(ids)];
}
var ago = (iso) => fmtDuration(Math.max(0, Date.now() - Date.parse(iso)));
async function listSuiteTests(suite, ctx) {
  const adapter = ADAPTERS[suite.adapter];
  fs6.rmSync(ctx.scratch, { recursive: true, force: true });
  fs6.mkdirSync(ctx.scratch, { recursive: true });
  const lc = listCommand(suite, adapter, ctx.vars, ctx.scratch, ctx.cwd);
  const cache = readListCache(ctx.root, suite);
  const fresh = cache && cache.key === suiteKey(suite) ? cache : undefined;
  let error;
  if (lc) {
    const v = { ...ctx.vars, WITNESS_REPORT_DIR: ctx.scratch };
    const env = childEnv(ctx.env, { WITNESS_REPORT_DIR: ctx.scratch, ...lc.format === "report" && lc.source === "native" && adapter.reportEnv ? adapter.reportEnv(ctx.scratch) : {}, ...Object.fromEntries(Object.entries(suite.env).map(([k, x]) => [k, substitute(x, v)])) });
    const r = await runCapture(lc.cmd, { cwd: ctx.cwd, env, timeoutMs: 5 * 60000, log: ctx.log, abort: ctx.abort, track: ctx.track });
    let ids = r.code === 0 || lc.format === "report" ? parseListing(lc, adapter, r.out, ctx.scratch, ctx.cwd) : [];
    if (ids.length) {
      let detail = `list: ${lc.source}`;
      if (CLASS_HASH.has(adapter.name) && fresh && ids.some((x) => !x.includes("#"))) {
        const byMethod = new Map;
        for (const c of fresh.ids)
          if (c.includes("#"))
            byMethod.set(c.slice(c.indexOf("#") + 1), [...byMethod.get(c.slice(c.indexOf("#") + 1)) ?? [], c]);
        ids = ids.map((x) => !x.includes("#") && byMethod.get(x)?.length === 1 ? byMethod.get(x)[0] : x);
        detail += `, class names from the last report ${fresh.run_id}`;
      }
      return { ids, source: lc.source, detail, log: ctx.log };
    }
    error = r.timedOut ? "listing timed out" : `listing failed (exit ${r.code}${r.code === 0 ? ", no tests in the output" : ""})`;
  }
  if (fresh)
    return { ids: fresh.ids, source: "last-report", detail: `list: last report ${fresh.run_id} (${ago(fresh.at)} ago, ${fresh.ids.length} tests${error ? `; ${lc.source} ${error}` : ""})`, error, log: lc ? ctx.log : undefined };
  const why = error ?? (lc ? "no tests listed" : `the ${adapter.name} adapter can't list tests and the suite has no complete run yet`);
  return { source: "none", detail: `list: none (${cache ? `${why}; the last report is from a different adapter or folder` : why})`, error: why, log: lc ? ctx.log : undefined };
}
function capabilities(suite, root, cwd, runSettings) {
  const a = ADAPTERS[suite.adapter];
  const out = [];
  const hint = suite.report ? undefined : a.reportHint?.(cwd, suite.cmd);
  let report;
  if (suite.report)
    report = `override ${suite.report}`;
  else if (hint)
    report = "none";
  else if (suite.adapter === "generic")
    report = "exit code only (or a report found in $WITNESS_REPORT_DIR)";
  else
    report = `adapter (${a.format}${a.fromStdout ? " on stdout" : ""})`;
  if (hint)
    out.push(`no per-test report: ${hint}`);
  else if (suite.adapter === "generic" && !suite.report)
    out.push('exit code only: one suite-level row and no per-test results unless the command writes a report to $WITNESS_REPORT_DIR (or set report = "<glob>")');
  const cache = readListCache(root, suite);
  const fresh = cache && cache.key === suiteKey(suite) ? cache : undefined;
  const nativeList = listCommand(suite, a, {}, "/x", cwd);
  const list = suite.list ? "template" : nativeList ? "native" : fresh ? `last-report ${fresh.run_id}` : "none";
  if (list === "none")
    out.push(`no test list: plan check can't confirm test ids, and a missing or unreadable report gives one suite-level row instead of per-test reruns (set list = "<cmd>", or run the whole suite once so witness can reuse its report)`);
  else if (list.startsWith("last-report"))
    out.push(`test list from the last complete report (${fresh.run_id}, ${ago(fresh.at)} ago): tests added since are unknown until the next full run`);
  let select;
  if (suite.select)
    select = "template";
  else if (hasSelectVar(suite.cmd))
    select = a.selectArgs ? "placeholder" : "none";
  else if (a.select ? a.select(suite.cmd, ["x"]) : a.selectArgs)
    select = "native";
  else
    select = "none";
  if (select === "none")
    out.push(`no selection: --select, --retries and per-test reruns don't work${a.selectArgs ? " (put ${WITNESS_SELECT} where the runner's arguments go: the command is too complex to rewrite)" : ' (set select = "<cmd> {ids}")'}`);
  const nativeTimeout = !!a.perTestTimeout?.(60000, cwd, suite.cmd);
  const ptt = suite.perTestTimeoutArg ? "template" : nativeTimeout ? "native" : "none";
  const set = suite.perTestTimeoutMs ? `per_test_timeout = ${fmtDuration(suite.perTestTimeoutMs)}` : "per_test_timeout not set";
  if (ptt === "none")
    out.push(`no per-test timeout${suite.perTestTimeoutMs ? ` (per_test_timeout = ${fmtDuration(suite.perTestTimeoutMs)} is ignored)` : ""}: a hanging test holds the suite until its timeout (${fmtDuration(suite.timeoutMs)}) or ${fmtDuration(runSettings.stallMs)} without output; set per_test_timeout_arg = "<runner flag with {s}>" if the runner has one`);
  return { suite: suite.name, report, list, select, per_test_timeout: ptt === "none" ? "none" : `${ptt}, ${set}`, consequences: out };
}
var capabilityLine = (c) => `report: ${c.report} · list: ${c.list} · select: ${c.select} · per-test timeout: ${c.per_test_timeout}`;

// src/output.ts
var useColor = process.stderr.isTTY && !process.env.NO_COLOR;
var c = (code) => (s) => useColor ? `\x1B[${code}m${s}\x1B[0m` : s;
var color = { dim: c("2"), bold: c("1"), red: c("31"), green: c("32"), yellow: c("33") };

class Progress {
  t0;
  quiet;
  lastAt = 0;
  constructor(t0 = Date.now(), quiet = false) {
    this.t0 = t0;
    this.quiet = quiet;
  }
  line(msg) {
    this.lastAt = Date.now();
    if (this.quiet)
      return;
    process.stderr.write(`witness  ${color.dim(`[${fmtClock(Date.now() - this.t0)}]`)} ${msg}
`);
  }
  plain(msg) {
    if (!this.quiet)
      process.stderr.write(`witness  ${msg}
`);
  }
}
function outcomeColor(outcome) {
  return outcome === "passed" ? color.green : outcome === "failed" ? color.red : color.yellow;
}

// src/rundir.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import * as fs7 from "node:fs";
import * as path7 from "node:path";
function newRunId(now = new Date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `r-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${randHex(4)}`;
}

class RunDir {
  dir;
  root;
  status;
  state;
  constructor(root, runId, init) {
    this.root = root;
    this.dir = path7.join(root, runId);
    fs7.mkdirSync(path7.join(this.dir, "logs"), { recursive: true });
    fs7.mkdirSync(path7.join(this.dir, "reports"), { recursive: true });
    const now = new Date().toISOString();
    this.status = { run_id: runId, phase: "starting", started_at: now, suites: [], last_event: "run started", pid: process.pid, ...init };
    this.state = { pid: process.pid, started_at: now, procs: [], ports: {}, worktrees: [] };
    this.saveStatus();
    this.saveState();
    this.event("run_started", { label: init.label, commit: init.commit });
  }
  get runId() {
    return this.status.run_id;
  }
  file(...p) {
    return path7.join(this.dir, ...p);
  }
  saveStatus() {
    writeJson(this.file("status.json"), this.status);
  }
  saveState() {
    writeJson(this.file("state.json"), this.state);
  }
  event(type, data = {}, lastEvent) {
    fs7.appendFileSync(this.file("events.jsonl"), JSON.stringify({ t: new Date().toISOString(), type, ...data }) + `
`);
    if (lastEvent) {
      this.status.last_event = lastEvent;
      this.saveStatus();
    }
  }
  setPhase(phase, lastEvent) {
    this.status.phase = phase;
    this.status.last_event = lastEvent;
    this.saveStatus();
    this.event("phase", { phase });
  }
  track(p) {
    this.state.procs.push(p);
    this.saveState();
  }
  untrack(pgid) {
    this.state.procs = this.state.procs.filter((p) => p.pgid !== pgid);
    this.saveState();
  }
  tracker(kind, name) {
    return (pgid, running) => running ? this.track({ kind, name, pid: pgid, pgid }) : this.untrack(pgid);
  }
  linkLatest() {
    const link = path7.join(this.root, "latest");
    try {
      fs7.rmSync(link, { force: true });
      fs7.symlinkSync(this.status.run_id, link);
    } catch {
      fs7.writeFileSync(link, this.status.run_id);
    }
  }
}
function resolveRun(root, id) {
  const which = !id || id === "latest" ? "latest" : id;
  const p = path7.join(root, which);
  try {
    const st = fs7.lstatSync(p);
    if (st.isSymbolicLink())
      return path7.join(root, fs7.readlinkSync(p));
    if (st.isFile())
      return path7.join(root, fs7.readFileSync(p, "utf8").trim());
    if (st.isDirectory())
      return p;
  } catch {
    if (which === "latest") {
      const runs = listRuns(root);
      return runs.length ? path7.join(root, runs[runs.length - 1]) : null;
    }
  }
  return null;
}
function listRuns(root) {
  try {
    return fs7.readdirSync(root).filter((d) => /^r-\d{8}-\d{6}-[0-9a-f]{4}$/.test(d) && fs7.existsSync(path7.join(root, d, "status.json"))).sort();
  } catch {
    return [];
  }
}
async function reapStale(root, graceMs, log) {
  const reaped = [];
  for (const id of listRuns(root)) {
    const dir = path7.join(root, id);
    const status = readJson(path7.join(dir, "status.json"), null);
    const state = readJson(path7.join(dir, "state.json"), null);
    if (!status || status.phase === "finished" || !state || state.pid === process.pid || pidAlive(state.pid))
      continue;
    const fresh = Date.now() - Date.parse(state.started_at) < 24 * 3600000;
    let killed = 0;
    if (fresh) {
      for (const p of state.procs)
        if (await killTracked(p, graceMs))
          killed++;
    }
    for (const wt of state.worktrees ?? [])
      removeWorktree(wt);
    status.phase = "finished";
    status.outcome = "interrupted";
    status.finished_at = new Date().toISOString();
    status.last_event = `reaped: witness (pid ${state.pid}) exited without finishing${killed ? `; killed ${killed} leftover process group(s)` : ""}`;
    writeJson(path7.join(dir, "status.json"), status);
    fs7.appendFileSync(path7.join(dir, "events.jsonl"), JSON.stringify({ t: new Date().toISOString(), type: "reaped", by: process.pid, killed }) + `
`);
    state.procs = [];
    writeJson(path7.join(dir, "state.json"), state);
    log(`reaped stale run ${id}${killed ? ` (killed ${killed} leftover process group(s))` : ""}`);
    reaped.push(id);
  }
  return reaped;
}
async function killTracked(p, graceMs, opts = {}) {
  let hit = false;
  const pid = p.pidfile ? Number(readText(p.pidfile)) : 0;
  if (p.stop && opts.runStop !== false && (pidAlive(pid) || groupAlive(p.pgid))) {
    spawnSync2("bash", ["-c", p.stop], { cwd: p.cwd, stdio: "ignore", timeout: 60000 });
    hit = true;
  }
  if (pid > 1 && pidAlive(pid)) {
    try {
      process.kill(pid, graceMs ? "SIGTERM" : "SIGKILL");
    } catch {}
    const until = Date.now() + graceMs;
    while (pidAlive(pid) && Date.now() < until)
      await new Promise((r) => setTimeout(r, 100));
    if (pidAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    hit = true;
  }
  if (groupAlive(p.pgid)) {
    await killGroup(p.pgid, graceMs);
    hit = true;
  }
  return hit;
}
function readText(f) {
  try {
    return fs7.readFileSync(f, "utf8").trim();
  } catch {
    return "";
  }
}
function removeWorktree(wt) {
  const common = git(wt, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common.ok)
    spawnSync2("git", ["--git-dir", common.out, "worktree", "remove", "--force", wt]);
  fs7.rmSync(wt, { recursive: true, force: true });
  if (common.ok)
    spawnSync2("git", ["--git-dir", common.out, "worktree", "prune"]);
}
function pruneRuns(root, keep) {
  const runs = listRuns(root);
  for (const id of runs.slice(0, Math.max(0, runs.length - keep))) {
    const st = readJson(path7.join(root, id, "status.json"), null);
    if (st && st.phase !== "finished")
      continue;
    fs7.rmSync(path7.join(root, id), { recursive: true, force: true });
  }
}

class LockError extends Error {
}
function acquireLock(file) {
  fs7.mkdirSync(path7.dirname(file), { recursive: true });
  for (let attempt = 0;attempt < 2; attempt++) {
    try {
      const fd = fs7.openSync(file, "wx");
      fs7.writeSync(fd, String(process.pid));
      fs7.closeSync(fd);
      return () => {
        try {
          if (fs7.readFileSync(file, "utf8").trim() === String(process.pid))
            fs7.rmSync(file, { force: true });
        } catch {}
      };
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      const pid = Number(fs7.readFileSync(file, "utf8").trim());
      if (pidAlive(pid) && pid !== process.pid)
        throw new LockError(`another witness run (pid ${pid}) is using this checkout; wait for it or stop it (lock: ${file})`);
      fs7.rmSync(file, { force: true });
    }
  }
  throw new LockError(`could not take the lock ${file}`);
}

// src/run.ts
import * as fs10 from "node:fs";
import * as os from "node:os";
import * as path10 from "node:path";

// src/ctrf.ts
var SCHEMA = "witness.run/v1";
var VERSION = "1.0.0-mvp";
function runSource() {
  const s = process.env.WITNESS_SOURCE;
  if (s === "morph" || s === "ci" || s === "local")
    return s;
  return process.env.CI && process.env.CI !== "false" ? "ci" : "local";
}
function buildCtrf(meta, tests) {
  const summary = { tests: tests.length, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0, start: meta.startedAt, stop: meta.finishedAt };
  for (const t of tests)
    summary[t.status]++;
  const witness = {
    schema: SCHEMA,
    version: VERSION,
    run_id: meta.runId,
    outcome: meta.outcome,
    commit: meta.commit,
    branch: meta.branch,
    dirty: meta.dirty,
    source: runSource(),
    started_at: new Date(meta.startedAt).toISOString(),
    finished_at: new Date(meta.finishedAt).toISOString()
  };
  if (meta.label)
    witness.label = meta.label;
  if (meta.against)
    witness.against = meta.against;
  if (meta.diagnosis)
    witness.diagnosis = meta.diagnosis;
  return {
    reportFormat: "CTRF",
    specVersion: "0.0.0",
    results: {
      tool: { name: "witness", version: VERSION, extra: { adapters: meta.adapters } },
      summary,
      tests: tests.map((t) => {
        const w = { id: t.id, suite: t.suite, adapter: t.adapter, obtained: t.obtained };
        if (t.statusDetail)
          w.status_detail = t.statusDetail;
        if (t.parity)
          w.parity = t.parity;
        if (t.originStatus)
          w.origin_status = t.originStatus;
        const o = { name: t.name, status: t.status, duration: t.durationMs };
        if (t.message)
          o.message = t.message;
        if (t.trace)
          o.trace = t.trace;
        if (t.filePath)
          o.filePath = t.filePath;
        o.suite = t.suite;
        if (t.retries)
          o.retries = t.retries;
        if (t.flaky)
          o.flaky = true;
        o.extra = { witness: w };
        return o;
      }),
      extra: { witness }
    }
  };
}

// src/stack.ts
import * as fs8 from "node:fs";
import * as path8 from "node:path";
class Failure extends Error {
  diagnosis;
  constructor(d) {
    super(`${d.cause}${d.evidence ? `: ${d.evidence}` : ""}`);
    this.diagnosis = d;
  }
}
var SETUP_TIMEOUT = 30 * 60000;
var upFile = (root) => path8.join(root, ".witness", "up.json");
function readUp2(root) {
  return readJson(upFile(root), null);
}

class Stack {
  o;
  live = new Map;
  depsStarted = [];
  taken = new Set;
  constructor(o) {
    this.o = o;
  }
  vars(self) {
    const v = { ...this.o.baseEnv, CHECKOUT: this.o.root };
    if (this.o.runDirPath)
      v.WITNESS_RUN_DIR = this.o.runDirPath;
    for (const [n, l] of this.live)
      v[`${n}.url`] = l.url;
    if (self) {
      v["self.url"] = self.url;
      if (self.port)
        v.PORT = String(self.port);
    }
    return v;
  }
  serviceUrlEnv() {
    const e = {};
    for (const [n, l] of this.live)
      e[`WITNESS_${n.toUpperCase().replace(/-/g, "_")}_URL`] = l.url;
    return e;
  }
  fail(stage, cause, extra = {}) {
    throw new Failure(diagnose({ stage, cause, ...extra }));
  }
  async checkDep(d) {
    if (d.checkHttp)
      return httpProbe(substitute(d.checkHttp, this.vars()), undefined, 5000);
    const r = await runCapture(substitute(d.check, this.vars()), { cwd: this.o.root, env: childEnv(this.o.baseEnv), timeoutMs: 15000 });
    const last = r.out.trim().split(`
`).pop() ?? "";
    return { ok: r.code === 0, detail: r.timedOut ? "check timed out" : last || `exit code ${r.code}` };
  }
  async checkDeps(deps = this.o.cfg.dependencies) {
    for (const d of deps) {
      const t0 = Date.now();
      let r = await this.checkDep(d);
      if (r.ok) {
        this.o.progress.line(`deps   ${d.name} · ok`);
        continue;
      }
      const log = path8.join(this.o.logDir, `dep-${d.name}.log`);
      if (d.start && !this.o.reuse?.deps_started.includes(d.name)) {
        this.o.progress.line(`deps   ${d.name} · not reachable (${r.detail}); starting it`);
        const s = await runCapture(substitute(d.start, this.vars()), { cwd: this.o.root, env: childEnv(this.o.baseEnv), timeoutMs: d.timeoutMs, log, abort: this.o.abort, track: this.o.run?.tracker("dependency", d.name) });
        if (this.o.abort.aborted)
          return;
        if (s.code !== 0)
          this.fail("deps", "dependency_unreachable", { command: d.start, log, evidence: s.out.trim().split(`
`).pop() });
        this.depsStarted.push(d);
        const until = Date.now() + d.timeoutMs;
        while (Date.now() < until && !this.o.abort.aborted) {
          r = await this.checkDep(d);
          if (r.ok)
            break;
          await sleep(1000);
        }
      }
      if (!r.ok)
        this.fail("deps", "dependency_unreachable", { command: d.check ?? `curl ${d.checkHttp}`, evidence: `${d.name}: ${r.detail}`, log: fs8.existsSync(log) ? log : undefined });
      this.o.progress.line(`deps   ${d.name} · ok (${fmtDuration(Date.now() - t0)})`);
    }
  }
  async boot(names, as = new Map) {
    for (const svc of topoOrder(this.o.cfg.services, names)) {
      if (this.o.abort.aborted)
        return;
      const alias = as.get(svc.name) ?? svc.name;
      if (this.live.has(alias))
        continue;
      await this.bootOne(svc, alias);
    }
  }
  async bootOne(svc, alias) {
    const t0 = Date.now();
    const cwd = path8.resolve(this.o.root, svc.cwd);
    const log = path8.join(this.o.logDir, `${svc.name}.log`);
    const prev = this.o.reuse?.services[svc.name];
    if (prev && this.o.reuse?.root === this.o.root && (prev.external || prev.pgid && groupAlive(prev.pgid) || prev.pid && pidAlive(prev.pid))) {
      const ls2 = { name: alias, svc, port: prev.port, url: prev.url, pgid: prev.pgid, pid: prev.pid, log: prev.log, ownedByUs: false, probeFailures: 0, lastProbe: 0 };
      if ((await this.probe(ls2)).ok) {
        this.live.set(alias, ls2);
        if (prev.port)
          this.taken.add(prev.port);
        this.o.progress.line(`boot   ${svc.name} · reusing the service from \`witness up\` at ${ls2.url}`);
        return;
      }
    }
    if (svc.external) {
      const ls2 = { name: alias, svc, url: svc.external.replace(/\/$/, ""), log, ownedByUs: false, probeFailures: 0, lastProbe: 0 };
      await this.waitReady(ls2, cwd, true);
      this.live.set(alias, ls2);
      this.o.progress.line(`boot   ${svc.name} · external ${ls2.url} is ready`);
      return;
    }
    const alloc = await allocatePort(svc.ports, this.taken);
    if (!alloc.port)
      this.fail("boot", "port_in_use", { service: svc.name, evidence: alloc.tried, port: svc.ports?.[0] });
    this.taken.add(alloc.port);
    this.o.run?.state && (this.o.run.state.ports[svc.name] = alloc.port);
    const ls = { name: alias, svc, port: alloc.port, url: `http://127.0.0.1:${alloc.port}`, log, ownedByUs: true, probeFailures: 0, lastProbe: 0 };
    const vars = this.vars(ls);
    const env = childEnv(this.o.baseEnv, { PORT: String(alloc.port), ...this.serviceUrlEnv(), ...mapValues(svc.env, (v) => substitute(v, vars)) });
    if (svc.setup)
      await this.setup(svc, cwd, env, vars, log);
    if (this.o.abort.aborted)
      return;
    const readyUrl = svc.ready?.http ? substitute(svc.ready.http, vars) : undefined;
    const held = readyUrl ? await heldReadyPort(readyUrl, alloc.port) : undefined;
    if (held)
      this.fail("boot", "port_in_use", { service: svc.name, port: held, url: readyUrl, evidence: `port ${held} (in ready.http ${readyUrl}) already accepts connections before ${svc.name} started: another process holds it, so the readiness check would talk to that process` });
    const cmd = substitute(svc.start, vars);
    const proc = spawnGroup(cmd, { name: svc.name, cwd, env, log });
    ls.proc = proc;
    ls.pgid = proc.pgid;
    this.live.set(alias, ls);
    this.o.run?.track({ kind: "service", name: svc.name, pid: proc.pid, pgid: proc.pgid, pidfile: svc.pidfile ? path8.resolve(cwd, substitute(svc.pidfile, vars)) : undefined, stop: svc.stop ? substitute(svc.stop, vars) : undefined, cwd });
    this.o.run?.event("service_started", { service: svc.name, pid: proc.pid, port: alloc.port, cmd }, `starting ${svc.name}`);
    this.o.progress.line(`boot   ${svc.name} · starting (PORT=${alloc.port}${readyUrl ? `, ready check ${readyUrl}` : ""})`);
    try {
      await this.waitReady(ls, cwd, false, cmd);
    } catch (e) {
      this.live.delete(alias);
      await this.stopOne(ls);
      throw e;
    }
    if (this.o.abort.aborted)
      return;
    this.o.run?.event("service_ready", { service: svc.name, url: ls.url, ms: Date.now() - t0 }, `${svc.name} ready`);
    this.o.progress.line(`boot   ${svc.name} · ready at ${ls.url} (${fmtDuration(Date.now() - t0)})`);
  }
  async setup(svc, cwd, env, vars, log) {
    const cmd = substitute(svc.setup, vars);
    if (this.o.noSetup) {
      this.o.progress.line(`setup  ${svc.name} · skipped (--no-setup)`);
      return;
    }
    const hash = this.o.setupCacheDir ? setupInputsHash(cwd, cmd) : null;
    const cacheFile2 = this.o.setupCacheDir ? path8.join(this.o.setupCacheDir, `${svc.name}.json`) : null;
    if (hash && cacheFile2 && readJson(cacheFile2, {}).hash === hash) {
      this.o.progress.line(`setup  ${svc.name} · skipped (inputs unchanged since the last successful setup)`);
      return;
    }
    const t0 = Date.now();
    this.o.progress.line(`setup  ${svc.name} · ${cmd}`);
    this.o.run?.event("setup_started", { service: svc.name, cmd }, `setup ${svc.name}`);
    const proc = spawnGroup(cmd, { name: `setup-${svc.name}`, cwd, env, log });
    this.o.run?.track({ kind: "setup", name: svc.name, pid: proc.pid, pgid: proc.pgid });
    const timer = setTimeout(() => void killGroup(proc.pgid, this.o.cfg.run.graceMs), SETUP_TIMEOUT);
    const abortPoll = setInterval(() => this.o.abort.aborted && void killGroup(proc.pgid, this.o.cfg.run.graceMs), 200);
    const { code } = await proc.exit;
    clearTimeout(timer);
    clearInterval(abortPoll);
    this.o.run?.untrack(proc.pgid);
    if (this.o.abort.aborted)
      return;
    if (code !== 0)
      this.fail("boot", "setup_failed", { service: svc.name, command: cmd, log, cwd: svc.cwd });
    if (hash && cacheFile2)
      writeJson(cacheFile2, { hash, at: new Date().toISOString() });
    this.o.progress.line(`setup  ${svc.name} · done (${fmtDuration(Date.now() - t0)})`);
  }
  async waitReady(ls, cwd, external, cmd) {
    const svc = ls.svc;
    const timeoutMs = svc.ready?.timeoutMs ?? 120000;
    const until = Date.now() + timeoutMs;
    const pidfile = svc.pidfile ? path8.resolve(cwd, substitute(svc.pidfile, this.vars(ls))) : undefined;
    let delay = 200;
    let last = "";
    let steady;
    const steadyAfter = Math.min(30000, timeoutMs / 2);
    const exitedFail = () => this.fail("boot", "exited_before_ready", { service: svc.name, command: cmd, log: ls.log, cwd: svc.cwd, port: ls.port, evidence: undefined });
    for (;; ) {
      if (this.o.abort.aborted)
        return;
      if (pidfile && !ls.pid && fs8.existsSync(pidfile)) {
        const pid = Number(fs8.readFileSync(pidfile, "utf8").trim());
        if (pid > 0)
          ls.pid = pid;
      }
      if (!external) {
        if (pidfile) {
          if (ls.pid && !pidAlive(ls.pid))
            exitedFail();
          if (!ls.pid && ls.proc?.exited && ls.proc.code !== 0)
            exitedFail();
        } else if (ls.proc?.exited)
          exitedFail();
      }
      const r = await this.probe(ls);
      if (r.ok)
        return;
      last = r.detail;
      const http4xx = /^HTTP (4\d\d)$/.exec(r.detail);
      const now = Date.now();
      if (!http4xx)
        steady = undefined;
      else if (steady?.status !== Number(http4xx[1]))
        steady = { status: Number(http4xx[1]), since: now };
      const stuck = steady && now - steady.since >= steadyAfter;
      if (now > until || stuck) {
        const url = svc.ready?.http ? substitute(svc.ready.http, this.vars(ls)) : external ? ls.url : undefined;
        const evidence = stuck ? `${url ?? "the ready URL"} answered HTTP ${steady.status} for ${fmtDuration(now - steady.since)}: the app is up but this URL is not its health check` : `not ready after ${fmtDuration(timeoutMs)}: ${last}`;
        this.fail("boot", "ready_timeout", { service: svc.name, command: svc.ready?.cmd ?? cmd, log: external ? undefined : ls.log, url, port: ls.port, evidence, cwd: svc.cwd, steadyStatus: stuck ? steady.status : undefined });
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 1000);
    }
  }
  async probe(ls) {
    const r = ls.svc.ready;
    if (!r) {
      if (!ls.svc.external)
        return { ok: false, detail: "no readiness check configured" };
      const h = await httpProbe(ls.url);
      return /^HTTP [1-4]\d\d$/.test(h.detail) ? { ok: true, detail: h.detail } : h;
    }
    const vars = this.vars(ls);
    if (r.http) {
      const url = substitute(r.http, vars);
      const res2 = await httpProbe(url, r.status);
      const v4 = `//127.0.0.1:${ls.port}`;
      if (res2.ok || !ls.ownedByUs || !ls.port || !url.includes(v4) || ls.url !== `http:${v4}` || /^HTTP/.test(res2.detail))
        return res2;
      const r6 = await httpProbe(url.replace(v4, `//[::1]:${ls.port}`), r.status);
      if (!r6.ok)
        return res2;
      ls.url = `http://[::1]:${ls.port}`;
      this.o.progress.line(`boot   ${ls.svc.name} · answers on ::1 (IPv6 loopback) only, not on 127.0.0.1; its URL is ${ls.url}`);
      return r6;
    }
    const env = childEnv(this.o.baseEnv, { PORT: String(ls.port ?? ""), ...this.serviceUrlEnv(), ...mapValues(ls.svc.env, (v) => substitute(v, vars)) });
    const res = await runCapture(substitute(r.cmd, vars), { cwd: path8.resolve(this.o.root, ls.svc.cwd), env, timeoutMs: 1e4 });
    return { ok: res.code === 0, detail: res.timedOut ? "ready cmd timed out" : res.out.trim().split(`
`).pop() || `exit code ${res.code}` };
  }
  async watch() {
    const now = Date.now();
    for (const ls of this.live.values()) {
      let dead = "";
      if (ls.ownedByUs && ls.proc && !ls.svc.pidfile && ls.proc.exited)
        dead = `exited with code ${ls.proc.code}`;
      else if (ls.pid && !pidAlive(ls.pid))
        dead = `pid ${ls.pid} is gone`;
      else if (!ls.ownedByUs && ls.pgid && !groupAlive(ls.pgid))
        dead = "process group is gone";
      if (!dead && (ls.svc.ready || ls.svc.external) && now - ls.lastProbe >= 5000) {
        ls.lastProbe = now;
        const r = await this.probe(ls);
        ls.probeFailures = r.ok ? 0 : ls.probeFailures + 1;
        if (ls.probeFailures >= 3)
          dead = `readiness check failed 3 times in a row (${r.detail})`;
      }
      if (dead) {
        const d = diagnose({ stage: "suite", cause: "service_died", service: ls.svc.name, log: fs8.existsSync(ls.log) ? ls.log : undefined, cwd: ls.svc.cwd });
        if (!d.evidence || d.cause === "service_died")
          d.evidence = d.evidence ? `${dead}; last log line: ${d.evidence}` : dead;
        return d;
      }
    }
    return null;
  }
  async stopOne(ls) {
    if (!ls.ownedByUs)
      return;
    const grace = this.o.cfg.run.graceMs;
    if (ls.svc.stop) {
      const cwd = path8.resolve(this.o.root, ls.svc.cwd);
      const r = await runCapture(substitute(ls.svc.stop, this.vars(ls)), { cwd, env: childEnv(this.o.baseEnv, { PORT: String(ls.port ?? "") }), timeoutMs: 60000, log: ls.log });
      if (r.code !== 0)
        this.o.progress.line(`stop   ${ls.svc.name} · stop command failed (exit ${r.code ?? "timeout"}); killing its processes; see ${ls.log}`);
    }
    if (ls.pid && pidAlive(ls.pid)) {
      try {
        process.kill(ls.pid, "SIGTERM");
      } catch {}
      const until = Date.now() + grace;
      while (pidAlive(ls.pid) && Date.now() < until)
        await sleep(100);
      if (pidAlive(ls.pid)) {
        try {
          process.kill(ls.pid, "SIGKILL");
        } catch {}
      }
    }
    if (ls.pgid) {
      await killGroup(ls.pgid, grace);
      this.o.run?.untrack(ls.pgid);
    }
  }
  async teardown(opts = {}) {
    for (const ls of [...this.live.values()].reverse())
      await this.stopOne(ls);
    this.live.clear();
    if (opts.keepDeps)
      return;
    for (const d of this.depsStarted.reverse()) {
      if (!d.stop)
        continue;
      this.o.progress.line(`deps   ${d.name} · stopping`);
      const log = path8.join(this.o.logDir, `dep-${d.name}.log`);
      const r = await runCapture(substitute(d.stop, this.vars()), { cwd: this.o.root, env: childEnv(this.o.baseEnv), timeoutMs: 120000, log });
      if (r.code !== 0)
        this.o.progress.line(`deps   ${d.name} · stop command failed (exit ${r.code ?? "timeout"}); it may still be running; see ${log}`);
    }
    this.depsStarted = [];
  }
}
var LOCAL = new Set(["127.0.0.1", "localhost", "0.0.0.0", "[::1]", "::1"]);
async function heldReadyPort(url, allocated) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  if (port === allocated || !LOCAL.has(u.hostname))
    return;
  const hosts = u.hostname === "localhost" ? ["127.0.0.1", "::1"] : u.hostname === "0.0.0.0" ? ["127.0.0.1"] : [u.hostname.replace(/^\[|\]$/g, "")];
  for (const h of hosts)
    if (await portAnswers(h, port))
      return port;
  return;
}
function mapValues(o, f) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
}
function setupInputsHash(cwd, cmd) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok)
    return null;
  const head = git(cwd, ["rev-parse", "HEAD:./"]);
  const diff = git(cwd, ["diff", "HEAD", "--", ".", ":(exclude).witness"]);
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard", "--", ".", ":(exclude).witness"]);
  if (!head.ok || !diff.ok || !untracked.ok)
    return null;
  const stamps = untracked.out.split(`
`).filter(Boolean).slice(0, 5000).map((f) => {
    try {
      const p = path8.join(cwd, f);
      const st = fs8.statSync(p);
      return st.size < 1024 * 1024 ? `${f}:${sha(fs8.readFileSync(p))}` : `${f}:${st.size}`;
    } catch {
      return f;
    }
  }).join(`
`);
  return sha([cmd, head.out, diff.out, stamps].join("\x00"));
}

// src/suite.ts
import * as fs9 from "node:fs";
import * as path9 from "node:path";
var MAX_RERUNS = 200;
var BUILD_FAILED = [
  /\berror (CS|FS|BC|MSB|NU|NETSDK)\d{4}\b/,
  /\bBuild FAILED\b/,
  /\[ERROR\] (COMPILATION ERROR|Failed to execute goal \S+:(compile|testCompile|resources))/,
  /Execution failed for task '[^']*:(compile\w*|process\w*Resources)'/,
  /^e: .*\.kts?:\d+/,
  /\berror TS\d{4}\b/,
  /^(FAIL|ok)\s+\S+\s+\[(build|setup) failed\]/,
  /^No test projects were found\.?$/,
  /: command not found$|^bash: .*: No such file or directory$/
];
function buildFailure(text, exitCode) {
  const lines = text.split(/\r?\n/);
  for (const re of BUILD_FAILED) {
    const hit = lines.find((l) => re.test(l.trim()));
    if (hit)
      return hit.trim().slice(0, 500);
  }
  return exitCode === 127 ? lines.filter((l) => l.trim()).at(-1)?.trim().slice(0, 500) : undefined;
}
function reportPathEvidence(text) {
  const paths = [];
  let listing = false;
  for (const line of text.split(/\r?\n/)) {
    const named = /Results File:\s*(\S.*\.(?:trx|xml|json))\s*$/i.exec(line);
    if (named)
      paths.push(named[1]);
    if (/artifacts produced:?\s*$/i.test(line))
      listing = true;
    else if (listing) {
      const m = /^\s*-\s+(\S.*\.(?:trx|xml|json))\s*$/i.exec(line);
      if (m)
        paths.push(m[1]);
      else if (line.trim())
        listing = false;
    }
  }
  const p = paths.find((x) => path9.isAbsolute(x));
  if (!p)
    return;
  return fs9.existsSync(p) ? `the test run wrote its report to ${p}, outside the folders witness reads; set report = "<glob>" for the suite` : `the test run says it wrote ${p}, but there is no such file here (written inside a container, or on another filesystem?)`;
}
function readFrom(file, offset) {
  try {
    const fd = fs9.openSync(file, "r");
    try {
      const size = fs9.fstatSync(fd).size;
      const start = Math.max(offset, size - 512 * 1024);
      const buf = Buffer.alloc(Math.max(0, size - start));
      fs9.readSync(fd, buf, 0, buf.length, start);
      return buf.toString("utf8");
    } finally {
      fs9.closeSync(fd);
    }
  } catch {
    return "";
  }
}
var safeId = (id) => id.replace(/[^\w.@-]+/g, "_").slice(0, 180);
function dirSize(dir) {
  let n = 0;
  const walk = (d) => {
    let es;
    try {
      es = fs9.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path9.join(d, e.name);
      if (e.isDirectory())
        walk(p);
      else
        n += fileSize(p) + 1;
    }
  };
  walk(dir);
  return n;
}
function perTestTimeoutArgs(suite, adapter, cwd, cmd) {
  if (!suite.perTestTimeoutMs)
    return null;
  if (suite.perTestTimeoutArg)
    return suite.perTestTimeoutArg.replace(/\{s\}/g, String(Math.ceil(suite.perTestTimeoutMs / 1000))).replace(/\{ms\}/g, String(suite.perTestTimeoutMs));
  return adapter.perTestTimeout?.(suite.perTestTimeoutMs, cwd, cmd) ?? null;
}
function suiteCommand(suite, adapter, vars, reportDir, select, cwd = ".") {
  let cmd = substitute(suite.cmd, vars);
  let selection;
  if (select?.length) {
    const fail = () => new Error(`suite ${suite.name}: adapter ${adapter.name} cannot select single tests in this command; put \${WITNESS_SELECT} where the runner's arguments go, or add select = "... {ids}" to the suite`);
    if (!suite.select && hasSelectVar(cmd)) {
      if (!adapter.selectArgs)
        throw fail();
      selection = adapter.selectArgs(select);
    } else
      cmd = selectCommand(adapter, cmd, select, suite.select ? substitute(suite.select, vars) : undefined) ?? (() => {
        throw fail();
      })();
  }
  if (adapter.reportArgs && !suite.report && !(adapter.reportMarker && adapter.reportMarker.test(cmd)))
    cmd = addArgs(cmd, adapter.reportArgs(reportDir, cwd, cmd));
  const ptt = perTestTimeoutArgs(suite, adapter, cwd, cmd);
  if (ptt)
    cmd = addArgs(cmd, ptt);
  return fillSelect(cmd, selection);
}
function mergePartial(kept, reran, exitCode) {
  const tests = [...kept, ...reran.tests];
  const note = `report partly unreadable; ${reran.tests.length} test(s) rerun alone`;
  if (tests.some((t) => t.status === "failed"))
    return { ...reran, tests, state: "failed", cause: "report_unreadable", note };
  if (tests.some((t) => t.status === "other"))
    return { ...reran, tests, state: "error", cause: "report_unreadable", note };
  return { ...reran, tests, state: exitCode === 0 ? "passed" : "error", cause: exitCode === 0 ? "report_unreadable" : "report_incomplete", note };
}
function canSelect(suite, adapter, vars = {}) {
  if (suite.select)
    return true;
  const cmd = substitute(suite.cmd, vars);
  if (hasSelectVar(cmd))
    return !!adapter.selectArgs;
  return !!selectCommand(adapter, cmd, ["x"]);
}
function missingPlugin(adapter, output, perTestTimeout) {
  const said = output.split(/\r?\n/).filter((l) => !l.startsWith("$ ")).join(`
`);
  return adapter.plugins?.find((p) => p.needed(perTestTimeout) && p.missing.test(said));
}
async function runSuite(ctx, suite, select, retries) {
  const adapter = ADAPTERS[suite.adapter];
  const cwd = path9.resolve(ctx.root, suite.cwd);
  const p = ctx.prefix ?? "";
  const reportDir = path9.join(ctx.outDir, "reports", suite.name);
  const log = path9.join(ctx.outDir, "logs", `${suite.name}.log`);
  fs9.rmSync(reportDir, { recursive: true, force: true });
  fs9.mkdirSync(reportDir, { recursive: true });
  const t0 = Date.now();
  const vars = { ...ctx.stack.vars(), WITNESS_REPORT_DIR: reportDir };
  const cmd = suiteCommand(suite, adapter, vars, reportDir, select, cwd);
  ctx.progress.line(`${p}suite  ${suite.name} · ${cmd}`);
  ctx.run.event("suite_started", { suite: suite.name, cmd, origin: !!p }, `${p}suite ${suite.name} running`);
  const logStart = fileSize(log);
  const before = snapshotReports(ctx, suite, adapter, cwd, reportDir);
  const exec = await execWatched(ctx, suite, adapter, cmd, cwd, reportDir, log, suite.timeoutMs);
  const files = collect(ctx, suite, adapter, cwd, reportDir, log, before, logStart);
  let expected = select;
  const usable = files.some((f) => f.cases.length);
  const hint = adapter.reportHint?.(cwd, cmd);
  const exitCodeOnly = suite.adapter === "generic" && !suite.report && files.length === 0;
  const output = !usable && exec.end === "exit" && !exitCodeOnly ? readFrom(log, logStart) : "";
  const plugin = output && exec.code !== 0 ? missingPlugin(adapter, output, !!suite.perTestTimeoutMs) : undefined;
  const broken = output && exec.code !== 0 ? plugin ? output.split(/\r?\n/).find((l) => !l.startsWith("$ ") && plugin.missing.test(l))?.trim().slice(0, 500) : buildFailure(output, exec.code) : undefined;
  let listed;
  if (!expected && (!usable || files.some((f) => f.error || f.partial)) && !hint && !broken && exec.end === "exit" && !(suite.adapter === "generic" && !suite.report)) {
    listed = await listTests(ctx, suite, cwd, log);
    expected = listed.ids;
  }
  let res = broken ? plugin ? { tests: [suiteLevel(adapter, suite.name, exec.code, `${plugin.name} is missing: ${broken}`)], state: "error", cause: "setup_failed", note: `${plugin.name} is missing`, evidence: broken, hint: plugin.hint } : { tests: [suiteLevel(adapter, suite.name, exec.code, `the suite command failed before running tests: ${broken}`)], state: "error", cause: "setup_failed", note: "build or command failed before any test ran", evidence: broken, hint: "the suite failed before any test ran (build error or missing command): fix that first; witness does not list or rerun tests after it" } : reconcile({ suite: suite.name, adapter, exitCode: exec.code, end: exec.end, files, expected, cwd, exitCodeOnly, selected: !!select?.length });
  if (!select?.length && !p && exec.end === "exit" && usable && !files.some((f) => f.error) && (res.state === "passed" || res.state === "failed"))
    writeListCache(ctx.cfg.root, suite, ctx.run.runId, ctx.run.status.commit, res.tests.filter((t) => t.obtained === "report").map((t) => t.id.slice(adapter.name.length + 1)));
  const kept = res.rerun?.length ? res.tests : [];
  if (res.rerun?.length && !ctx.abort.aborted) {
    const selectable = canSelect(suite, adapter, vars);
    if (res.rerun.length <= MAX_RERUNS && selectable && !hint) {
      ctx.progress.line(`${p}suite  ${suite.name} · ${res.cause === "report_unreadable" ? "report unreadable" : "no report"}; rerunning ${res.rerun.length} test(s) one at a time (${listed?.detail ?? "list: --select"})`);
      const results = [];
      for (const [i, id] of res.rerun.entries()) {
        if (ctx.abort.aborted)
          break;
        const dir = path9.join(reportDir, "rerun", String(i + 1));
        fs9.mkdirSync(dir, { recursive: true });
        const c2 = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, [id], cwd);
        const snap = snapshotReports(ctx, suite, adapter, cwd, dir);
        const rlog = path9.join(ctx.outDir, "logs", `${suite.name}.rerun.log`);
        const from = fileSize(rlog);
        const e = await execWatched(ctx, suite, adapter, c2, cwd, dir, rlog, suite.perTestTimeoutMs ?? Math.min(suite.timeoutMs, 10 * 60000));
        if (e.died) {
          exec.died = e.died;
          break;
        }
        const got = collect(ctx, suite, adapter, cwd, dir, rlog, snap, from);
        if (i === 0 && !got.some((f) => f.cases.length)) {
          ctx.progress.line(`${p}suite  ${suite.name} · a single test run alone wrote no report either; not rerunning the rest`);
          results.length = 0;
          break;
        }
        results.push({ id, exitCode: e.code, files: got, timedOut: e.end !== "exit" });
      }
      const ids = res.rerun;
      res = results.length ? fromReruns(results, adapter, suite.name, cwd, exec.code, res.cause, listed?.source === "last-report" ? listed.detail : undefined) : { ...res, rerun: undefined, tests: ids.map((id) => missing(stableId(adapter.name, id), adapter, suite.name, "missing", `no report from the suite (exit code ${exec.code}), nor when one test ran alone`)) };
      if (kept.length)
        res = mergePartial(kept, res, exec.code);
      if (listed)
        res.note = `${res.note} · ${listed.detail}`;
    } else {
      const why = !selectable ? "this suite can't select single tests" : hint ? "the suite can't write a per-test report" : `more than ${MAX_RERUNS} tests`;
      const note = `${res.note}; exit code ${exec.code}; no per-test reruns: ${why}`;
      res = { ...res, tests: kept.length ? [...kept, ...res.rerun.map((id) => missing(stableId(adapter.name, id), adapter, suite.name, "missing", note))] : [suiteLevel(adapter, suite.name, exec.code, note)] };
    }
  } else if (res.cause && (res.cause === "report_missing" || res.cause === "report_unreadable") && listed && !listed.ids) {
    res.note = `${res.note} · ${listed.detail}`;
  }
  if (retries > 0 && res.state === "failed" && exec.end === "exit" && !exec.died && canSelect(suite, adapter, vars)) {
    await retryFailed(ctx, suite, adapter, cwd, vars, reportDir, res.tests, retries);
    if (!res.tests.some((t) => t.status === "failed"))
      res = { ...res, state: "passed" };
  }
  const summary = summarize(suite.name, res.state, res.tests);
  summary.exit_code = exec.code;
  if (res.cause)
    summary.cause = res.cause;
  if (res.note)
    summary.note = res.note;
  let diagnosis;
  if (exec.died)
    diagnosis = exec.died;
  else if (res.cause && res.state !== "failed" && res.state !== "passed") {
    const h = res.cause === "report_missing" ? hint : undefined;
    const evidence = res.evidence ?? h ?? (res.cause === "report_unreadable" ? files.find((f) => f.error)?.error : res.cause === "report_incomplete" ? res.note : res.cause === "report_missing" ? reportPathEvidence(output) : undefined);
    const extraTry = [h, res.hint].filter((x) => !!x);
    diagnosis = diagnose({ stage: res.cause.startsWith("report") ? "report" : "suite", cause: res.cause, suite: suite.name, command: cmd, log, cwd: suite.cwd, evidence, extraTry, perTestTimeout: !!(adapter.perTestTimeout && adapter.perTestTimeout(60000, cwd, cmd)), adapter: suite.adapter });
  }
  ctx.run.event("suite_finished", { suite: suite.name, state: summary.state, exit_code: exec.code, end: exec.end, cause: res.cause, passed: summary.passed, failed: summary.failed, ms: Date.now() - t0 }, `${p}suite ${suite.name} ${summary.state}`);
  const counts = [`${summary.passed} passed`, `${summary.failed} failed`, summary.error && `${summary.error} error`, summary.missing && `${summary.missing} missing`, summary.skipped && `${summary.skipped} skipped`].filter(Boolean).join(", ");
  ctx.progress.line(`${p}suite  ${suite.name} · ${summary.state} · ${counts} · exit ${exec.code ?? "-"} (${fmtDuration(Date.now() - t0)})${res.note ? ` · ${res.note}` : ""}`);
  return { summary, tests: res.tests, diagnosis, serviceDied: exec.died };
}
async function execWatched(ctx, suite, adapter, cmd, cwd, reportDir, log, timeoutMs) {
  const artifacts = path9.join(ctx.outDir, "artifacts");
  fs9.mkdirSync(artifacts, { recursive: true });
  const vars = ctx.stack.vars();
  const env = childEnv(ctx.baseEnv, {
    ...ctx.stack.serviceUrlEnv(),
    WITNESS_REPORT_DIR: reportDir,
    WITNESS_ARTIFACTS: artifacts,
    WITNESS_RUN_DIR: ctx.run.dir,
    ...adapter.reportEnv && !suite.report ? adapter.reportEnv(reportDir) : {},
    ...Object.fromEntries(Object.entries(suite.env).map(([k, v]) => [k, substitute(v, { ...vars, WITNESS_REPORT_DIR: reportDir })]))
  });
  const t0 = Date.now();
  const proc = spawnGroup(cmd, { name: suite.name, cwd, env, log });
  ctx.run.track({ kind: "suite", name: suite.name, pid: proc.pid, pgid: proc.pgid });
  let lastSize = -1;
  let lastProgress = Date.now();
  let lastWatch = 0;
  let end = "exit";
  let died;
  const logStart = fileSize(log);
  for (;; ) {
    const exited = await Promise.race([proc.exit.then(() => true), sleep(500).then(() => false)]);
    if (exited)
      break;
    const now = Date.now();
    const size = fileSize(log) + dirSize(reportDir);
    if (size !== lastSize) {
      lastSize = size;
      lastProgress = now;
    }
    ctx.activity.text = `suite ${suite.name} running ${fmtDuration(now - t0)} · log ${fmtBytes(fileSize(log) - logStart)} · last output ${fmtDuration(now - lastProgress)} ago`;
    if (ctx.abort.aborted)
      end = "interrupted";
    else if (now - t0 > timeoutMs)
      end = "timeout";
    else if (now - lastProgress > ctx.cfg.run.stallMs)
      end = "stalled";
    else if (now - lastWatch >= 1000) {
      lastWatch = now;
      const d = await ctx.stack.watch();
      if (d) {
        died = d;
        end = "service_died";
      }
    }
    if (end !== "exit") {
      const why = end === "timeout" ? `suite timeout (${fmtDuration(timeoutMs)})` : end === "stalled" ? `no output and no report growth for ${fmtDuration(ctx.cfg.run.stallMs)}` : end === "service_died" ? `service ${died?.service} died` : "interrupted";
      ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · stopping: ${why}`);
      fs9.appendFileSync(log, `
witness: stopping suite: ${why}
`);
      await killGroup(proc.pgid, ctx.cfg.run.graceMs);
      break;
    }
  }
  await Promise.race([proc.exit, sleep(2000)]);
  ctx.run.untrack(proc.pgid);
  ctx.activity.text = "";
  return { code: end === "exit" ? proc.code : null, end, ms: Date.now() - t0, died };
}
function outsideReports(ctx, suite, adapter, cwd, reportDir) {
  const out = [];
  const globs = suite.report ? [{ base: "cwd", glob: substitute(suite.report, { ...ctx.stack.vars(), WITNESS_REPORT_DIR: reportDir }) }] : adapter.reportGlobs;
  for (const g of globs) {
    if (g.base === "report-dir")
      continue;
    let base = cwd;
    let glob = g.glob;
    if (path9.isAbsolute(glob)) {
      const fixed = glob.split("/").findIndex((x) => /[*?{]/.test(x));
      const parts = glob.split("/");
      base = fixed < 0 ? path9.dirname(glob) : parts.slice(0, fixed).join("/") || "/";
      glob = fixed < 0 ? path9.basename(glob) : parts.slice(fixed).join("/");
    }
    for (const rel of globFiles(base, [glob], { skipDirs: new Set([".git", "node_modules", ".witness"]) }))
      out.push({ src: path9.join(base, rel), rel });
  }
  return out;
}
var stamp = (f) => {
  try {
    const st = fs9.statSync(f);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "";
  }
};
function snapshotReports(ctx, suite, adapter, cwd, reportDir) {
  return new Map(outsideReports(ctx, suite, adapter, cwd, reportDir).filter((f) => !f.src.startsWith(reportDir + path9.sep)).map((f) => [f.src, stamp(f.src)]));
}
function collect(ctx, suite, adapter, cwd, reportDir, log, before, logFrom = 0) {
  const files = [];
  if (adapter.fromStdout && !suite.report) {
    const out = path9.join(reportDir, "stdout.jsonl");
    try {
      fs9.copyFileSync(log, out);
      files.push(out);
    } catch {}
  }
  if (!suite.report) {
    for (const g of adapter.reportGlobs)
      if (g.base === "report-dir")
        for (const f of globFiles(reportDir, [g.glob], { skipDirs: new Set(["rerun", "retry"]) }))
          files.push(path9.join(reportDir, f));
  }
  for (const { src, rel } of outsideReports(ctx, suite, adapter, cwd, reportDir)) {
    if (src.startsWith(reportDir + path9.sep)) {
      files.push(src);
      continue;
    }
    if (before.get(src) === stamp(src))
      continue;
    const dst = path9.join(reportDir, rel.replace(/[\\/]/g, "__"));
    fs9.copyFileSync(src, dst);
    files.push(dst);
  }
  const parsed = [...new Set(files)].map((f) => parseReportFile(f, adapter.format, cwd));
  adapter.amend?.(parsed, readFrom(log, logFrom));
  return parsed;
}
async function listTests(ctx, suite, cwd, log) {
  ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · listing tests to see what the run left out`);
  const l = await listSuiteTests(suite, { root: ctx.cfg.root, cwd, vars: ctx.stack.vars(), env: childEnv(ctx.baseEnv, ctx.stack.serviceUrlEnv()), log: log.replace(/\.log$/, ".list.log"), scratch: path9.join(ctx.outDir, "reports", suite.name, "list"), abort: ctx.abort, track: ctx.run.tracker("list", suite.name) });
  ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · ${l.ids ? `${l.ids.length} test(s), ` : ""}${l.detail}`);
  return l;
}
async function retryFailed(ctx, suite, adapter, cwd, vars, reportDir, tests, retries) {
  for (let k = 1;k <= retries; k++) {
    const failing = tests.filter((t) => t.status === "failed" && t.obtained !== "suite-level");
    if (!failing.length || ctx.abort.aborted)
      return;
    const ids = failing.map((t) => t.id.slice(adapter.name.length + 1));
    const dir = path9.join(reportDir, "retry", String(k));
    fs9.mkdirSync(dir, { recursive: true });
    const cmd = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, ids, cwd);
    ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · retry ${k}/${retries} of ${ids.length} failed test(s)`);
    const rlog = path9.join(ctx.outDir, "logs", `${suite.name}.retry.log`);
    const snap = snapshotReports(ctx, suite, adapter, cwd, dir);
    const from = fileSize(rlog);
    const e = await execWatched(ctx, suite, adapter, cmd, cwd, dir, rlog, suite.timeoutMs);
    if (e.end !== "exit")
      return;
    const again = collect(ctx, suite, adapter, cwd, dir, rlog, snap, from).flatMap((f) => f.cases.map((c2) => toRecord(c2, adapter, suite.name, cwd)));
    for (const t of failing) {
      const r = again.find((a) => a.id === t.id);
      t.retries = (t.retries ?? 0) + 1;
      if (r?.status === "passed") {
        t.status = "passed";
        t.flaky = true;
        delete t.statusDetail;
      }
    }
  }
}
var MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".webm": "video/webm", ".mp4": "video/mp4", ".mov": "video/quicktime", ".zip": "application/zip", ".json": "application/json", ".xml": "application/xml", ".trx": "application/xml", ".html": "text/html", ".txt": "text/plain", ".log": "text/plain", ".md": "text/markdown" };
function artifactType(file, ct) {
  if (ct.startsWith("image/"))
    return "screenshot";
  if (ct.startsWith("video/"))
    return "video";
  if (/trace/i.test(path9.basename(file)) || ct === "application/zip")
    return "trace";
  if (ct === "text/plain")
    return "log";
  return "report";
}
function collectArtifacts(runDir, outDir, tests) {
  const out = [];
  const artDir = path9.join(outDir, "artifacts");
  const bySafe = new Map;
  for (const t of tests) {
    bySafe.set(safeId(t.id), t);
    bySafe.set(safeId(t.id.slice(t.adapter.length + 1)), t);
    bySafe.set(safeId(t.name), t);
  }
  for (const t of tests) {
    for (const a of t.attachments ?? []) {
      if (!fs9.existsSync(a.path) || fs9.statSync(a.path).size > 200 * 1024 * 1024)
        continue;
      const dst = path9.join(artDir, safeId(t.id), path9.basename(a.path));
      if (path9.resolve(a.path) !== dst) {
        fs9.mkdirSync(path9.dirname(dst), { recursive: true });
        fs9.copyFileSync(a.path, dst);
      }
      a.path = path9.relative(runDir, dst);
    }
  }
  const walk = (d, test, dirName) => {
    let es;
    try {
      es = fs9.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path9.join(d, e.name);
      if (e.isDirectory())
        walk(p, test, dirName);
      else {
        const ext = path9.extname(e.name).toLowerCase();
        const ct = MIME[ext] ?? "application/octet-stream";
        const fromAttachment = test?.attachments?.find((a) => path9.resolve(runDir, a.path) === p);
        const step = /^(?:step[-_]?)?(\d+)[-_](.+)\.\w+$/.exec(e.name);
        const entry = { file: path9.relative(runDir, p), artifact_type: artifactType(e.name, fromAttachment?.contentType || ct), test_name: test?.name ?? dirName, test_id: test?.id ?? null, content_type: fromAttachment?.contentType || ct, size_bytes: fileSize(p) };
        if (step) {
          entry.step_index = Number(step[1]);
          entry.step_label = step[2].replace(/[-_]+/g, " ");
        }
        out.push(entry);
      }
    }
  };
  try {
    for (const e of fs9.readdirSync(artDir, { withFileTypes: true })) {
      if (e.isDirectory())
        walk(path9.join(artDir, e.name), bySafe.get(e.name), e.name);
    }
  } catch {}
  return out;
}

// src/run.ts
class UsageError extends Error {
}
function pickSuites(cfg, names) {
  if (!names?.length)
    return cfg.suites;
  const out = [];
  for (const n of names) {
    const s = cfg.suites.find((x) => x.name === n);
    if (!s)
      throw new UsageError(`unknown suite "${n}"; suites: ${cfg.suites.map((x) => x.name).join(", ") || "(none)"}`);
    out.push(s);
  }
  return out;
}
function splitSelect(suites, select) {
  if (!select?.length)
    return;
  const m = new Map;
  for (const raw of select) {
    let colon = raw.indexOf(":");
    let pre = colon > 0 ? raw.slice(0, colon) : "";
    let pool = suites;
    if (pre && !(pre in ADAPTERS) && suites.some((s) => s.name === pre)) {
      const rest = raw.slice(colon + 1);
      const c2 = rest.indexOf(":");
      if (c2 > 0 && rest.slice(0, c2) in ADAPTERS) {
        pool = suites.filter((s) => s.name === pre);
        colon += c2 + 1;
        pre = rest.slice(0, c2);
      }
    }
    const owners = pre in ADAPTERS ? pool.filter((s) => s.adapter === pre) : pool;
    const id = pre in ADAPTERS ? raw.slice(colon + 1) : raw;
    if (!owners.length)
      throw new UsageError(`--select ${raw}: no selected suite uses adapter ${pre}`);
    if (owners.length > 1)
      throw new UsageError(`--select ${raw}: suites ${owners.map((s) => s.name).join(", ")} could all own it; add --suite or write it as <suite>:${raw}`);
    m.set(owners[0].name, [...m.get(owners[0].name) ?? [], id]);
  }
  return m;
}
function neededServices(cfg, suites, role = "target") {
  const all = cfg.services.filter((s) => s.role === role).map((s) => s.name);
  return [...new Set(suites.flatMap((s) => s.services ?? all))];
}
function originMap(cfg) {
  const m = new Map;
  for (const o of cfg.services.filter((s) => s.role === "origin")) {
    const target = o.originFor ?? o.name.replace(/[-_]origin$/, "");
    if (cfg.services.some((s) => s.name === target && s.role === "target"))
      m.set(target, o);
  }
  return m;
}
async function runCommand(cfg, opts) {
  let suites = pickSuites(cfg, opts.suites);
  const select = splitSelect(suites, opts.select);
  if (select && !opts.suites?.length)
    suites = suites.filter((s) => select.has(s.name));
  if (opts.against && !originMap(cfg).size && !git(cfg.root, ["rev-parse", "--verify", "--quiet", `${opts.against}^{commit}`]).ok)
    throw new UsageError(`--against ${opts.against}: not a commit in this repo (try a branch, tag or sha from \`git log\`)`);
  if (!suites.length)
    throw new UsageError("no [[suite]] in the config");
  for (const [name, ids] of select ?? []) {
    const s = suites.find((x) => x.name === name);
    if (!selectCommand(ADAPTERS[s.adapter], s.cmd, ids, s.select))
      throw new UsageError(`suite ${name}: adapter ${s.adapter} cannot select tests${s.select ? ` with select = "${s.select}" (use {ids}, or {id} for one test)` : '; add select = "<cmd> {ids}" to the suite'}`);
  }
  const progress = new Progress(Date.now(), false);
  let release;
  try {
    release = acquireLock(path10.join(cfg.root, ".witness", "run.lock"));
  } catch (e) {
    if (e instanceof LockError) {
      progress.plain(color.red(e.message));
      return EXIT.error;
    }
    throw e;
  }
  await reapStale(opts.runDirRoot, cfg.run.graceMs, (m) => progress.line(m));
  const g = gitInfo(cfg.root);
  const run = new RunDir(opts.runDirRoot, newRunId(), { commit: g.commit, branch: g.branch, dirty: g.dirty, label: opts.label });
  run.linkLatest();
  const abort = { aborted: false };
  const activity = { text: "" };
  const t0 = Date.now();
  progress.line(`run ${run.runId} · ${g.branch || "(no branch)"} @ ${g.commit.slice(0, 10) || "(no commit)"}${g.dirty ? " (dirty)" : ""} · ${suites.length} suite(s)`);
  let sigints = 0;
  const onSignal = (sig) => {
    sigints++;
    abort.aborted = true;
    run.event("signal", { signal: sig }, `interrupted by ${sig}`);
    if (sigints === 1)
      progress.line(`${sig}: stopping (press Ctrl-C again to kill everything now)`);
    else {
      for (const p of run.state.procs)
        killTracked(p, 0, { runStop: false });
      run.status.phase = "finished";
      run.status.outcome = "interrupted";
      run.status.finished_at = new Date().toISOString();
      run.saveStatus();
      release();
      process.exit(EXIT.interrupted);
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const hb = setInterval(() => {
    if (Date.now() - progress.lastAt >= cfg.run.heartbeatMs)
      progress.line(`… ${activity.text || run.status.last_event}`);
  }, Math.min(cfg.run.heartbeatMs, 1000));
  const { env: baseEnv, missing: missing2 } = loadEnv(cfg);
  let target = { outcome: "passed", suites: [], tests: [], artifacts: [] };
  let against;
  let internalError;
  try {
    if (missing2.length) {
      target = { ...target, outcome: "mistrial", diagnosis: diagnose({ stage: "config", cause: "missing_env", envMissing: missing2 }) };
    } else {
      target = await runSide(cfg, {
        root: cfg.root,
        run,
        outDir: run.dir,
        progress,
        abort,
        activity,
        baseEnv,
        suites,
        select,
        retries: opts.retries,
        noSetup: opts.noSetup,
        setupCacheDir: path10.join(cfg.root, ".witness", "cache", "setup"),
        reuseUp: true
      });
      if (opts.against && !abort.aborted && target.outcome !== "mistrial") {
        run.setPhase("against", `running against ${opts.against}`);
        const origin = await runAgainst(cfg, opts, { run, progress, abort, activity, baseEnv, suites, select });
        const { tests, counts } = applyParity(target.tests, origin.tests);
        target.tests = tests;
        against = { ref: opts.against, outcome: origin.outcome, parity: counts, diagnosis: origin.diagnosis };
        target.artifacts.push(...origin.artifacts);
        progress.line(`against ${opts.against} · origin ${origin.outcome} · parity: ${counts.same} same, ${counts.differs} differ, ${counts.target_only} only on target, ${counts.origin_only} only on origin`);
        if (origin.diagnosis && origin.outcome !== "passed" && origin.outcome !== "failed")
          for (const l of formatDiagnosis(origin.diagnosis))
            progress.plain(`  origin ${l}`);
      }
    }
  } catch (e) {
    internalError = e.stack ?? String(e);
    progress.plain(color.red(`witness internal error: ${internalError}`));
    target = { ...target, outcome: "error" };
  } finally {
    clearInterval(hb);
  }
  if (abort.aborted)
    target.outcome = "interrupted";
  run.setPhase("report", "writing results");
  const finishedAt = Date.now();
  const status = run.status;
  status.suites = target.suites;
  status.outcome = target.outcome;
  if (target.diagnosis)
    status.diagnosis = target.diagnosis;
  if (internalError)
    status.internal_error = internalError.split(`
`)[0];
  if (against)
    status.against = { ref: against.ref, outcome: against.outcome, parity: against.parity, ...against.diagnosis && against.outcome !== "passed" && against.outcome !== "failed" ? { diagnosis: against.diagnosis } : {} };
  const ctrf = buildCtrf({
    runId: run.runId,
    outcome: target.outcome,
    commit: g.commit,
    branch: g.branch,
    dirty: g.dirty,
    label: opts.label,
    startedAt: t0,
    finishedAt,
    diagnosis: target.diagnosis,
    against: against ? { ref: against.ref, outcome: against.outcome, parity: against.parity } : undefined,
    adapters: [...new Set(suites.map((s) => s.adapter))]
  }, target.tests);
  writeJson(run.file("results.ctrf.json"), ctrf);
  writeJson(run.file("artifacts.json"), target.artifacts);
  status.summary = { tests: ctrf.results.summary.tests, passed: ctrf.results.summary.passed, failed: ctrf.results.summary.failed, skipped: ctrf.results.summary.skipped, pending: ctrf.results.summary.pending, other: ctrf.results.summary.other };
  status.finished_at = new Date(finishedAt).toISOString();
  status.phase = "finished";
  status.last_event = `finished: ${target.outcome}`;
  run.saveStatus();
  run.event("run_finished", { outcome: target.outcome, summary: status.summary });
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  pruneRuns(opts.runDirRoot, cfg.run.keepRuns);
  release();
  printVerdict(progress, status, finishedAt - t0, run.dir);
  if (opts.json)
    process.stdout.write(JSON.stringify(status, null, 2) + `
`);
  return EXIT[target.outcome];
}
function verdictSummary(status, ms) {
  const parts = [];
  if (status.summary) {
    const sum = (k) => status.suites.reduce((a, x) => a + (x[k] ?? 0), 0);
    parts.push(`${sum("passed")} passed, ${sum("failed")} failed`);
    if (sum("error"))
      parts.push(`${sum("error")} error`);
    if (sum("missing"))
      parts.push(`${sum("missing")} missing`);
    if (sum("skipped"))
      parts.push(`${sum("skipped")} skipped`);
    if (status.against?.parity?.origin_only)
      parts.push(`${status.against.parity.origin_only} only on origin`);
  }
  parts.push(`${status.suites.length} suite(s)`);
  if (status.against)
    parts.push(`against ${status.against.ref}: origin ${status.against.outcome}${status.against.parity ? `, ${status.against.parity.differs} differ` : ""}`);
  if (ms != null)
    parts.push(fmtDuration(ms));
  return parts.join(" · ");
}
function printVerdict(progress, status, ms, dir) {
  const o = status.outcome ?? "error";
  progress.plain(`${color.bold(outcomeColor(o)(`VERDICT ${o}`))} · ${verdictSummary(status, ms)}`);
  if (status.diagnosis && o !== "passed" && o !== "failed")
    for (const l of formatDiagnosis(status.diagnosis))
      progress.plain(`  ${l}`);
  for (const s of status.suites)
    if (s.state !== "passed")
      progress.plain(`  suite ${s.name}: ${s.state}${s.cause ? ` (${s.cause})` : ""}${s.note ? ` · ${s.note}` : ""}`);
  progress.plain(`  run dir: ${dir}`);
}
async function runSide(cfg, o) {
  const side = { outcome: "passed", suites: [], tests: [], artifacts: [] };
  const logDir = path10.join(o.outDir, "logs");
  fs10.mkdirSync(logDir, { recursive: true });
  const stack = new Stack({ cfg, root: o.root, baseEnv: o.baseEnv, logDir, progress: o.progress, run: o.run, noSetup: o.noSetup, setupCacheDir: o.setupCacheDir, runDirPath: o.run.dir, abort: o.abort, reuse: o.reuseUp ? readUp2(cfg.root) : null });
  const isTarget = !o.prefix;
  try {
    if (isTarget)
      o.run.setPhase("deps", "checking dependencies");
    await stack.checkDeps();
    if (isTarget)
      o.run.setPhase("boot", "booting services");
    const alias = new Map;
    const bootName = (n) => {
      const org = o.origin?.get(n);
      if (org)
        alias.set(org.name, n);
      return org?.name ?? n;
    };
    const chain = (names) => topoOrder(cfg.services, names.map(bootName)).map((x) => x.name);
    const bootFailed = new Map;
    const blocker = (names) => chain(names).find((n) => bootFailed.has(n));
    for (const n of neededServices(cfg, o.suites)) {
      if (o.abort.aborted || blocker([n]))
        continue;
      try {
        await stack.boot([bootName(n)], alias);
      } catch (e) {
        if (!(e instanceof Failure))
          throw e;
        bootFailed.set(e.diagnosis.service && chain([n]).includes(e.diagnosis.service) ? e.diagnosis.service : bootName(n), e.diagnosis);
        o.run.event("mistrial", { diagnosis: e.diagnosis }, `mistrial: ${e.diagnosis.cause}`);
        side.outcome = "mistrial";
        side.diagnosis ??= e.diagnosis;
      }
    }
    if (isTarget)
      o.run.setPhase("suite", "running suites");
    const ctx = { cfg, root: o.root, outDir: o.outDir, stack, run: o.run, progress: o.progress, abort: o.abort, baseEnv: o.baseEnv, prefix: o.prefix, activity: o.activity };
    for (const s of o.suites) {
      if (o.abort.aborted)
        break;
      const blocked = blocker(neededServices(cfg, [s]));
      if (blocked) {
        side.suites.push({ name: s.name, state: "skipped", passed: 0, failed: 0, skipped: 0, error: 0, missing: 0, note: `not run: service ${blocked} ${bootFailed.get(blocked).cause}` });
        continue;
      }
      const r = await runSuite(ctx, s, o.select?.get(s.name), o.retries);
      side.suites.push(r.summary);
      side.tests.push(...r.tests);
      const so = suiteOutcome(r.summary);
      if (worst(side.outcome, so) !== side.outcome) {
        side.outcome = worst(side.outcome, so);
        if (r.diagnosis)
          side.diagnosis = r.diagnosis;
      }
      if (isTarget) {
        o.run.status.suites = side.suites;
        o.run.saveStatus();
      }
      if (r.serviceDied) {
        for (const rest of o.suites.slice(o.suites.indexOf(s) + 1))
          side.suites.push({ name: rest.name, state: "skipped", passed: 0, failed: 0, skipped: 0, error: 0, missing: 0, note: "not run: a service died" });
        break;
      }
    }
  } catch (e) {
    if (!(e instanceof Failure))
      throw e;
    side.outcome = "mistrial";
    side.diagnosis = e.diagnosis;
    o.run.event("mistrial", { diagnosis: e.diagnosis }, `mistrial: ${e.diagnosis.cause}`);
    for (const s of o.suites)
      if (!side.suites.some((x) => x.name === s.name))
        side.suites.push({ name: s.name, state: "skipped", passed: 0, failed: 0, skipped: 0, error: 0, missing: 0, note: `not run: ${e.diagnosis.cause}` });
  } finally {
    await stack.teardown();
  }
  side.artifacts = collectArtifacts(o.run.dir, o.outDir, side.tests);
  return side;
}
async function runAgainst(cfg, opts, o) {
  const outDir = path10.join(o.run.dir, "against");
  const origin = originMap(cfg);
  if (origin.size) {
    o.progress.line(`against ${opts.against} · using role = "origin" services: ${[...origin.values()].map((s) => s.name).join(", ")}`);
    return runSide(cfg, { ...o, root: cfg.root, outDir, retries: 0, noSetup: opts.noSetup, setupCacheDir: path10.join(cfg.root, ".witness", "cache", "setup-origin"), reuseUp: false, prefix: "origin ", origin });
  }
  const ref = opts.against;
  const w = addWorktree(cfg, ref);
  if ("diagnosis" in w)
    return { outcome: "mistrial", suites: [], tests: [], diagnosis: w.diagnosis, artifacts: [] };
  o.run.state.worktrees.push(w.wt);
  o.run.saveState();
  o.progress.line(`against ${ref} · checked out ${w.sha.slice(0, 10)} in ${w.wt}`);
  if (w.copied)
    o.progress.line(`against ${ref} · copied the target's .witness/ (config helpers) into the worktree`);
  try {
    return await runSide(cfg, { ...o, root: w.root, outDir, retries: 0, noSetup: false, setupCacheDir: null, reuseUp: false, prefix: "origin " });
  } finally {
    removeWorktree2(cfg, w.wt);
    o.run.state.worktrees = o.run.state.worktrees.filter((x) => x !== w.wt);
    o.run.saveState();
  }
}
function addWorktree(cfg, ref) {
  const resolved = git(cfg.root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!resolved.ok)
    return { diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence: `--against ${ref}: not a commit in this repo (${resolved.err})` }) };
  const wt = fs10.mkdtempSync(path10.join(os.tmpdir(), "witness-against-"));
  const add = git(cfg.root, ["worktree", "add", "--detach", wt, resolved.out]);
  if (!add.ok) {
    fs10.rmSync(wt, { recursive: true, force: true });
    return { diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence: `git worktree add failed: ${add.err}` }) };
  }
  const root = path10.join(wt, path10.relative(gitTop(cfg.root), fs10.realpathSync(cfg.root)));
  const copied = copyWitnessDir(path10.join(cfg.root, ".witness"), path10.join(root, ".witness"));
  return { wt, root, sha: resolved.out, copied };
}
function removeWorktree2(cfg, wt) {
  git(cfg.root, ["worktree", "remove", "--force", wt]);
  fs10.rmSync(wt, { recursive: true, force: true });
  git(cfg.root, ["worktree", "prune"]);
}
var NOT_COPIED = new Set(["runs", "check", "cache", "up", "up.json", "run.lock", "scratch"]);
function copyWitnessDir(src, dst) {
  if (!fs10.existsSync(src))
    return false;
  fs10.cpSync(src, dst, { recursive: true, force: true, filter: (p) => !NOT_COPIED.has(path10.relative(src, p).split(path10.sep)[0]) });
  return true;
}
function ensureScratch(root) {
  const dir = path10.join(root, ".witness", "scratch");
  try {
    fs10.mkdirSync(dir, { recursive: true });
    if (!fs10.existsSync(path10.join(dir, ".gitignore")))
      fs10.writeFileSync(path10.join(dir, ".gitignore"), `*
`);
  } catch {}
}
function gitTop(dir) {
  const r = git(dir, ["rev-parse", "--show-toplevel"]);
  return r.ok ? fs10.realpathSync(r.out) : dir;
}

// src/commands.ts
var STAGES = ["config", "deps", "boot", "suite"];
function printDiag(p, d) {
  for (const l of formatDiagnosis(d))
    p.plain(`  ${l}`);
}
async function checkCommand(cfg, o) {
  const p = new Progress;
  const upTo = STAGES.indexOf(o.stage ?? "suite");
  const report = [];
  const caps = pickSuites(cfg, o.suites).map((s) => capabilities(s, cfg.root, path11.resolve(cfg.root, s.cwd), { stallMs: cfg.run.stallMs }));
  const done = (code2) => {
    if (o.json)
      process.stdout.write(JSON.stringify({ ok: code2 === 0, stages: report, capabilities: caps }, null, 2) + `
`);
    return code2;
  };
  report.push({ stage: "config", ok: true, detail: `${cfg.services.length} service(s), ${cfg.suites.length} suite(s), adapters: ${[...new Set(cfg.suites.map((s) => s.adapter))].join(", ") || "-"}` });
  p.line(`check  config · ok · ${report[0].detail}`);
  for (const c2 of caps) {
    p.line(`check  suite ${c2.suite} · ${capabilityLine(c2)}`);
    for (const x of c2.consequences)
      p.plain(`         - ${x}`);
  }
  if (upTo < 1) {
    p.plain(color.green("CHECK ok · config"));
    return done(0);
  }
  const { env, missing: missing2, fileUsed } = loadEnv(cfg);
  if (missing2.length) {
    const d = diagnose({ stage: "config", cause: "missing_env", envMissing: missing2 });
    report.push({ stage: "deps", ok: false, detail: "missing env", diagnosis: d });
    p.line(color.red(`check  env · missing ${missing2.join(", ")}${fileUsed ? ` (env file ${fileUsed})` : ""}`));
    printDiag(p, d);
    return done(EXIT.mistrial);
  }
  let release;
  try {
    release = acquireLock(path11.join(cfg.root, ".witness", "run.lock"));
  } catch (e) {
    if (e instanceof LockError) {
      p.plain(color.red(e.message));
      return done(EXIT.error);
    }
    throw e;
  }
  const checkRoot = path11.join(cfg.root, ".witness", "check");
  await reapStale(checkRoot, cfg.run.graceMs, (m) => p.line(m));
  fs11.rmSync(checkRoot, { recursive: true, force: true });
  const g = gitInfo(cfg.root);
  const run = new RunDir(checkRoot, newRunId(), { commit: g.commit, branch: g.branch, dirty: g.dirty, label: "check" });
  const abort = { aborted: false };
  const onSig = () => abort.aborted = true;
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
  let root = cfg.root;
  let wt;
  if (o.against) {
    const w = addWorktree(cfg, o.against);
    if ("diagnosis" in w) {
      release();
      p.line(color.red(`check  --against ${o.against} · ${w.diagnosis.evidence}`));
      return done(EXIT_USAGE);
    }
    ({ wt, root } = w);
    run.state.worktrees.push(wt);
    run.saveState();
    p.line(`check  against ${o.against} · checked out ${w.sha.slice(0, 10)} in ${wt}${w.copied ? " (with this checkout's .witness/)" : ""}`);
  }
  const stack = new Stack({ cfg, root, baseEnv: env, logDir: run.file("logs"), progress: p, run, noSetup: o.noSetup && !wt, setupCacheDir: wt ? null : path11.join(cfg.root, ".witness", "cache", "setup"), runDirPath: run.dir, abort, reuse: wt ? null : readUp2(cfg.root) });
  let code = 0;
  try {
    await stack.checkDeps();
    report.push({ stage: "deps", ok: true, detail: `${cfg.dependencies.length} dependency check(s) passed` });
    if (upTo < 2) {
      p.plain(color.green(`CHECK ok · up to deps${o.against ? ` · against ${o.against}` : ""}`));
      return done(0);
    }
    const services = o.service ? [o.service] : cfg.services.filter((s) => s.role === "target").map((s) => s.name);
    for (const s of services)
      if (!cfg.services.some((x) => x.name === s))
        throw new Error(`unknown service "${s}"`);
    await stack.boot(services);
    report.push({ stage: "boot", ok: true, detail: [...stack.live.values()].map((l) => `${l.svc.name} at ${l.url}`).join(", ") || "no services" });
    if (upTo < 3) {
      p.plain(color.green(`CHECK ok · up to boot${o.against ? ` · against ${o.against}` : ""}`));
      return done(0);
    }
    const suites = pickSuites(cfg, o.suites).filter((s) => !o.service || !s.services || s.services.includes(o.service));
    const ctx = { cfg, root, outDir: run.dir, stack, run, progress: p, abort, baseEnv: env, activity: { text: "" } };
    for (const s of suites) {
      const ad = ADAPTERS[s.adapter];
      const hint = s.report ? undefined : ad.reportHint?.(path11.resolve(root, s.cwd), s.cmd);
      if (hint) {
        const d = diagnose({ stage: "report", cause: "report_missing", suite: s.name, command: s.cmd, evidence: hint, extraTry: [hint] });
        report.push({ stage: "suite", ok: false, detail: `${s.name}: cannot write a per-test report`, diagnosis: d });
        p.line(color.red(`check  suite ${s.name} · cannot write a per-test report`));
        printDiag(p, d);
        code = Math.max(code, EXIT.error);
        continue;
      }
      const cwd = path11.resolve(root, s.cwd);
      const cenv = childEnv(env, { ...stack.serviceUrlEnv(), ...Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, substitute(v, stack.vars())])) });
      let pluginMissing = false;
      for (const pl of ad.plugins ?? []) {
        if (!pl.needed(!!s.perTestTimeoutMs) || !pl.probeArgs)
          continue;
        const r2 = await runCapture(fillSelect(addArgs(substitute(s.cmd, stack.vars()), pl.probeArgs)), { cwd, env: cenv, timeoutMs: 5 * 60000, log: run.file("logs", `${s.name}.plugins.log`), abort, track: run.tracker("list", s.name) });
        if (r2.code === 0 || !pl.missing.test(r2.out))
          continue;
        const d = diagnose({ stage: "suite", cause: "setup_failed", suite: s.name, command: s.cmd, evidence: r2.out.split(/\r?\n/).find((l2) => pl.missing.test(l2))?.trim(), extraTry: [pl.hint] });
        report.push({ stage: "suite", ok: false, detail: `${s.name}: ${pl.name} is missing`, diagnosis: d });
        p.line(color.red(`check  suite ${s.name} · ${pl.name} is missing: ${pl.hint}`));
        printDiag(p, d);
        code = Math.max(code, EXIT.error);
        pluginMissing = true;
      }
      if (pluginMissing)
        continue;
      const l = await listSuiteTests(s, { root: cfg.root, cwd, vars: stack.vars(), env: cenv, log: run.file("logs", `${s.name}.list.log`), scratch: run.file("reports", s.name, "list"), abort, track: run.tracker("list", s.name) });
      const cap = caps.find((c2) => c2.suite === s.name);
      if (cap)
        cap.list = l.detail.replace(/^list: /, "");
      if (l.ids && l.source !== "last-report") {
        report.push({ stage: "suite", ok: true, detail: `${s.name}: ${l.ids.length} test(s) listed (${l.detail})` });
        p.line(`check  suite ${s.name} · ${l.ids.length} test(s) listed (${l.detail}), e.g. ${s.adapter}:${l.ids[0]}`);
        continue;
      }
      p.line(`check  suite ${s.name} · ${l.detail}; doing a smoke run`);
      const r = await runSuite(ctx, s, undefined, 0);
      const ok = r.summary.state === "passed" || r.summary.state === "failed";
      report.push({ stage: "suite", ok, detail: `${s.name}: ${r.summary.state}`, diagnosis: r.diagnosis });
      if (!ok) {
        code = Math.max(code, r.serviceDied ? EXIT.mistrial : EXIT.error);
        if (r.diagnosis)
          printDiag(p, r.diagnosis);
      }
      if (r.serviceDied)
        break;
    }
  } catch (e) {
    if (!(e instanceof Failure))
      throw e;
    const stage = e.diagnosis.stage === "deps" ? "deps" : "boot";
    report.push({ stage, ok: false, detail: e.diagnosis.cause, diagnosis: e.diagnosis });
    p.line(color.red(`check  ${stage} · ${e.diagnosis.cause}`));
    printDiag(p, e.diagnosis);
    code = EXIT.mistrial;
  } finally {
    await stack.teardown();
    if (wt) {
      removeWorktree2(cfg, wt);
      run.state.worktrees = [];
      run.saveState();
    }
    run.status.phase = "finished";
    run.saveStatus();
    release();
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }
  if (abort.aborted)
    code = EXIT.interrupted;
  const on = o.against ? ` · against ${o.against}` : "";
  p.plain(code === 0 ? color.green(`CHECK ok${on}`) : color.yellow(`CHECK failed${on} · logs: ${run.file("logs")}`));
  return done(code);
}
var EXIT_USAGE = 64;
async function upCommand(cfg, o) {
  const p = new Progress;
  const existing = readUp2(cfg.root);
  if (existing && Object.values(existing.services).some((s) => s.pgid && groupAlive(s.pgid) || s.pid && pidAlive(s.pid))) {
    p.plain(`services are already up (${Object.keys(existing.services).join(", ")}); run \`witness down\` first`);
    return EXIT.error;
  }
  const { env, missing: missing2 } = loadEnv(cfg);
  if (missing2.length) {
    printDiag(p, diagnose({ stage: "config", cause: "missing_env", envMissing: missing2 }));
    return EXIT.mistrial;
  }
  await reapStale(o.runDirRoot, cfg.run.graceMs, (m) => p.line(m));
  const logDir = path11.join(cfg.root, ".witness", "up", "logs");
  fs11.mkdirSync(logDir, { recursive: true });
  const abort = { aborted: false };
  const stack = new Stack({ cfg, root: cfg.root, baseEnv: env, logDir, progress: p, noSetup: o.noSetup, setupCacheDir: path11.join(cfg.root, ".witness", "cache", "setup"), abort });
  try {
    await stack.checkDeps();
    await stack.boot(o.service ? [o.service] : neededServices(cfg, cfg.suites));
  } catch (e) {
    if (!(e instanceof Failure))
      throw e;
    await stack.teardown();
    p.plain(color.yellow(`UP failed · ${e.diagnosis.cause}`));
    printDiag(p, e.diagnosis);
    return EXIT.mistrial;
  }
  const state = { pid: process.pid, started_at: new Date().toISOString(), root: cfg.root, services: {}, deps_started: stack.depsStarted.map((d) => d.name) };
  for (const [n, l] of stack.live)
    state.services[n] = { pgid: l.pgid, pid: l.pid, port: l.port, url: l.url, log: l.log, external: !!l.svc.external };
  writeJson(upFile(cfg.root), state);
  for (const l of stack.live.values())
    l.proc?.child.unref();
  p.plain(color.green(`UP · ${[...stack.live.values()].map((l) => `${l.svc.name} ${l.url}`).join(" · ")}`));
  if (o.json)
    process.stdout.write(JSON.stringify(state, null, 2) + `
`);
  return 0;
}
async function downCommand(cfg, o) {
  const p = new Progress;
  const state = readUp2(cfg.root);
  if (!state) {
    p.plain("nothing is up");
    return 0;
  }
  const { env } = loadEnv(cfg);
  for (const [name, s] of Object.entries(state.services).reverse()) {
    const svc = cfg.services.find((x) => x.name === name);
    if (s.external)
      continue;
    if (svc?.stop)
      await runCapture(svc.stop, { cwd: path11.resolve(cfg.root, svc.cwd), env: childEnv(env, { PORT: String(s.port ?? "") }), timeoutMs: 60000, log: s.log });
    if (s.pid && pidAlive(s.pid)) {
      try {
        process.kill(s.pid, "SIGTERM");
      } catch {}
      for (let i = 0;i < 50 && pidAlive(s.pid); i++)
        await sleep(100);
    }
    if (s.pgid)
      await killGroup(s.pgid, cfg.run.graceMs);
    p.line(`down   ${name} · stopped`);
  }
  for (const d of [...state.deps_started].reverse()) {
    const dep = cfg.dependencies.find((x) => x.name === d);
    if (dep?.stop) {
      await runCapture(dep.stop, { cwd: cfg.root, env: childEnv(env), timeoutMs: 120000 });
      p.line(`down   ${d} · stopped`);
    }
  }
  fs11.rmSync(upFile(cfg.root), { force: true });
  if (o.json)
    process.stdout.write(JSON.stringify({ ok: true }) + `
`);
  return 0;
}
function statusCommand(runRoot, id, json) {
  const dir = resolveRun(runRoot, id);
  const st = dir ? readJson(path11.join(dir, "status.json"), null) : null;
  if (!st) {
    process.stderr.write(`witness  no run found${id ? ` for ${id}` : ""} under ${runRoot}
`);
    return EXIT.error;
  }
  if (json) {
    process.stdout.write(JSON.stringify(st, null, 2) + `
`);
    return 0;
  }
  const o = st.outcome ?? "running";
  const lines = [`${st.run_id} · ${st.phase}${st.outcome ? ` · ${outcomeColor(o)(o)}` : ""} · ${st.branch} @ ${st.commit.slice(0, 10)}${st.dirty ? " (dirty)" : ""}`];
  lines.push(`last event: ${st.last_event}`);
  if (st.phase !== "finished" && !pidAlive(st.pid))
    lines.push(color.yellow(`witness (pid ${st.pid}) is gone; the next run will reap this one`));
  for (const s of st.suites)
    lines.push(`  ${s.name.padEnd(20)} ${s.state.padEnd(11)} ${s.passed} passed, ${s.failed} failed, ${s.error} error, ${s.missing} missing, ${s.skipped} skipped${s.cause ? ` · ${s.cause}` : ""}`);
  if (st.summary)
    lines.push(verdictSummary(st));
  if (st.diagnosis)
    lines.push(...formatDiagnosis(st.diagnosis).map((l) => `  ${l}`));
  process.stdout.write(lines.join(`
`) + `
`);
  return 0;
}
function reportCommand(runRoot, id, format) {
  const dir = resolveRun(runRoot, id);
  const st = dir ? readJson(path11.join(dir, "status.json"), null) : null;
  if (!dir || !st) {
    process.stderr.write(`witness  no run found${id ? ` for ${id}` : ""} under ${runRoot}
`);
    return EXIT.error;
  }
  const ctrf = readJson(path11.join(dir, "results.ctrf.json"), null);
  const tests = ctrf?.results?.tests ?? [];
  const bad = tests.filter((t) => t.status === "failed" || t.status === "other");
  const differs = tests.filter((t) => t.extra?.witness?.parity === "differs");
  if (format === "json") {
    const out = { run_id: st.run_id, outcome: st.outcome, commit: st.commit, branch: st.branch, dirty: st.dirty, summary: st.summary, suites: st.suites, diagnosis: st.diagnosis, against: st.against, not_passing: bad.map((t) => ({ id: t.extra?.witness?.id, status: t.status, status_detail: t.extra?.witness?.status_detail, message: t.message })), parity_differs: differs.map((t) => ({ id: t.extra?.witness?.id, status: t.status, origin_status: t.extra?.witness?.origin_status })) };
    process.stdout.write(JSON.stringify(out, null, 2) + `
`);
    return 0;
  }
  const md = [];
  md.push(`# Witness run ${st.run_id}: ${st.outcome ?? st.phase}`);
  md.push("");
  md.push(`${st.branch} @ \`${st.commit.slice(0, 12)}\`${st.dirty ? " (uncommitted changes)" : ""}${st.label ? ` · ${st.label}` : ""} · ${verdictSummary(st)}`);
  md.push("");
  md.push("| Suite | State | Passed | Failed | Error | Missing | Skipped |");
  md.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const s of st.suites)
    md.push(`| ${s.name} | ${s.state}${s.cause ? ` (${s.cause})` : ""} | ${s.passed} | ${s.failed} | ${s.error} | ${s.missing} | ${s.skipped} |`);
  if (st.diagnosis) {
    md.push("", "## Diagnosis", "");
    for (const l of formatDiagnosis(st.diagnosis))
      md.push(`- ${l.replace(/^(\w+):/, "**$1**:")}`);
  }
  if (bad.length) {
    md.push("", `## Not passing (${bad.length})`, "");
    for (const t of bad.slice(0, 50))
      md.push(`- \`${t.extra?.witness?.id ?? t.name}\` ${t.status}${t.extra?.witness?.status_detail ? ` (${t.extra.witness.status_detail})` : ""}${t.message ? `: ${t.message.split(`
`)[0].slice(0, 200)}` : ""}`);
    if (bad.length > 50)
      md.push(`- … ${bad.length - 50} more in results.ctrf.json`);
  }
  if (st.against) {
    md.push("", `## Against ${st.against.ref}`, "", `Origin outcome: ${st.against.outcome}.${st.against.parity ? ` Parity: ${Object.entries(st.against.parity).map(([k, v]) => `${v} ${k}`).join(", ")}.` : ""}`);
    for (const t of differs.slice(0, 50))
      md.push(`- \`${t.extra?.witness?.id}\`: ${t.extra?.witness?.origin_status} on origin, ${t.status} on target`);
  }
  md.push("", `Run dir: \`${dir}\``);
  process.stdout.write(md.join(`
`) + `
`);
  return 0;
}

// src/init.ts
import * as fs12 from "node:fs";
import * as path12 from "node:path";
var read = (f) => {
  try {
    return fs12.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};
var SKIP = new Set([".git", "node_modules", ".witness", ".venv", "venv", "bin", "obj", "target", "build", "dist", "vendor", ".gradle"]);
function guess(root) {
  const files = globFiles(root, ["**/*"], { maxDepth: 4, skipDirs: SKIP });
  const has = (re) => files.filter((f) => re.test(f));
  const g = { suites: [], services: [] };
  const name = (base) => {
    let n = base.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "tests";
    if (!/^[a-z]/.test(n))
      n = `t-${n}`;
    let k = n;
    for (let i = 2;g.suites.some((s) => s.name === k) || g.services.some((s) => s.name === k); i++)
      k = `${n}-${i}`;
    return k;
  };
  const dirOf = (f) => path12.dirname(f) || ".";
  const py = has(/(^|\/)(pytest\.ini|conftest\.py|pyproject\.toml|setup\.cfg|tox\.ini)$/).filter((f) => /pytest\.ini|conftest\.py/.test(f) || /\[tool\.pytest|\[tool:pytest\]|\[pytest\]|pytest/.test(read(path12.join(root, f))));
  const pyDirs = [...new Set(py.map(dirOf))].filter((d, _i, a) => !a.some((o) => o !== d && (d.startsWith(`${o}/`) || o === ".")) || d === ".");
  for (const d of pyDirs.slice(0, 3))
    g.suites.push({ name: name(d === "." ? "pytest" : `${path12.basename(d)}-pytest`), adapter: "pytest", cwd: d, cmd: "python -m pytest", why: `found ${py.find((f) => dirOf(f) === d)}` });
  const pom = has(/(^|\/)pom\.xml$/).sort((a, b) => a.length - b.length)[0];
  if (pom) {
    g.suites.push({ name: name("maven-tests"), adapter: "junit-maven", cwd: dirOf(pom), cmd: "mvn -B verify", why: `found ${pom}` });
    if (/spring-boot/.test(read(path12.join(root, pom))))
      g.services.push({ name: name("app"), cwd: dirOf(pom), setup: "mvn -B -DskipTests package", start: "mvn -B spring-boot:run -Dspring-boot.run.arguments=--server.port=${PORT}", ready: "${self.url}/actuator/health", why: "spring-boot in pom.xml" });
  }
  const gradle = has(/(^|\/)build\.gradle(\.kts)?$/).sort((a, b) => a.length - b.length)[0];
  if (gradle)
    g.suites.push({ name: name("gradle-tests"), adapter: "junit-gradle", cwd: dirOf(gradle), cmd: fs12.existsSync(path12.join(root, dirOf(gradle), "gradlew")) ? "./gradlew test" : "gradle test", why: `found ${gradle}` });
  const csproj = has(/\.csproj$/);
  const testProjects = csproj.filter((f) => /Microsoft\.NET\.Test\.Sdk|xunit|NUnit|MSTest/i.test(read(path12.join(root, f))));
  const sln = has(/\.(sln|slnx)$/).sort((a, b) => a.length - b.length)[0];
  const mtp = dotnetMode(root) !== "vstest";
  if (testProjects.length && testProjects.length <= 6) {
    for (const f of testProjects)
      g.suites.push({ name: name(path12.basename(f, ".csproj")), adapter: "dotnet", cwd: ".", cmd: `dotnet test ${mtp ? "--project " : ""}${f}`, why: `test project ${f}${mtp ? " (Microsoft.Testing.Platform)" : ""}` });
  } else if (testProjects.length || sln)
    g.suites.push({ name: name("dotnet-tests"), adapter: "dotnet", cwd: sln ? dirOf(sln) : ".", cmd: sln ? `dotnet test ${mtp ? "--solution " : ""}${path12.basename(sln)}` : "dotnet test", why: sln ? `found ${sln}` : "test projects found" });
  for (const f of csproj.filter((f2) => /Sdk="Microsoft\.NET\.Sdk\.Web"/.test(read(path12.join(root, f2)))).slice(0, 3)) {
    g.services.push({ name: name(path12.basename(f, ".csproj")), cwd: ".", setup: `dotnet build ${f}`, start: `dotnet run --no-build --project ${f} --urls http://127.0.0.1:\${PORT}`, ready: "${self.url}/", why: `web project ${f}` });
  }
  for (const pj of has(/(^|\/)package\.json$/).filter((f) => f.split("/").length <= 3)) {
    let doc;
    try {
      doc = JSON.parse(read(path12.join(root, pj)));
    } catch {
      continue;
    }
    const deps = { ...doc.dependencies, ...doc.devDependencies };
    const d = dirOf(pj);
    const base = d === "." ? "" : `${path12.basename(d)}-`;
    if (deps["@playwright/test"])
      g.suites.push({ name: name(`${base}playwright`), adapter: "playwright", cwd: d, cmd: "npx playwright test", why: `@playwright/test in ${pj}` });
    if (deps.vitest)
      g.suites.push({ name: name(`${base}vitest`), adapter: "vitest", cwd: d, cmd: "npx vitest run", why: `vitest in ${pj}` });
    if (deps.jest)
      g.suites.push({ name: name(`${base}jest`), adapter: "jest", cwd: d, cmd: "npx jest", why: `jest in ${pj}` });
    if (deps.mocha)
      g.suites.push({ name: name(`${base}mocha`), adapter: "mocha", cwd: d, cmd: "npx mocha", why: `mocha in ${pj}` });
    if (doc.scripts?.start)
      g.services.push({ name: name(`${base}web`.replace(/-$/, "")), cwd: d, setup: fs12.existsSync(path12.join(root, d, "package-lock.json")) ? "npm ci" : "npm install", start: "npm start", ready: "${self.url}/", why: `start script in ${pj}` });
  }
  const gomod = has(/(^|\/)go\.mod$/).sort((a, b) => a.length - b.length)[0];
  if (gomod)
    g.suites.push({ name: name("go-tests"), adapter: "go", cwd: dirOf(gomod), cmd: "go test ./...", why: `found ${gomod}` });
  const gem = has(/(^|\/)Gemfile$/).find((f) => /rspec/.test(read(path12.join(root, f))));
  if (gem)
    g.suites.push({ name: name("rspec"), adapter: "rspec", cwd: dirOf(gem), cmd: "bundle exec rspec", why: `rspec in ${gem}` });
  const php = has(/(^|\/)phpunit\.xml(\.dist)?$/)[0];
  if (php)
    g.suites.push({ name: name("phpunit"), adapter: "phpunit", cwd: dirOf(php), cmd: "vendor/bin/phpunit", why: `found ${php}` });
  if (fs12.existsSync(path12.join(root, "manage.py")))
    g.services.push({ name: name("django"), cwd: ".", setup: "pip install -r requirements.txt", start: "python manage.py runserver 127.0.0.1:${PORT} --noreload", ready: "${self.url}/", why: "manage.py" });
  return g;
}
var q = (s) => JSON.stringify(s);
function renderExample(g) {
  const out = [
    "# Witness config (version 1). Generated by `witness init` from the files in this repo: review it,",
    "# then save it as .witness/witness.toml. Run `witness check` to try it.",
    "version = 1",
    "",
    "[env]",
    'file = ".witness/.env"        # KEY=VALUE lines, gitignored',
    'required = []                 # names that must be set, e.g. ["DATABASE_URL"]',
    "",
    "# [[dependency]]",
    '# name = "postgres"',
    '# check = "pg_isready -h localhost"',
    '# start = "docker compose up -d db"',
    '# timeout = "60s"',
    ""
  ];
  for (const s of g.services) {
    out.push(`# ${s.why}`, "[[service]]", `name = ${q(s.name)}`, `cwd = ${q(s.cwd)}`);
    if (s.setup)
      out.push(`setup = ${q(s.setup)}`);
    out.push(`start = ${q(s.start)}`, `ready = { http = ${q(s.ready)}, timeout = "180s" }`, "");
  }
  if (!g.services.length)
    out.push("# [[service]]", '# name = "api"', '# start = "npm start -- --port ${PORT}"', '# ready = { http = "${self.url}/health", timeout = "120s" }', "");
  for (const s of g.suites) {
    out.push(`# ${s.why}`, "[[suite]]", `name = ${q(s.name)}`, `adapter = ${q(s.adapter)}`, `cwd = ${q(s.cwd)}`, `cmd = ${q(s.cmd)}`);
    if (g.services.length)
      out.push("service = []                 # services this suite needs up; omit for all");
    out.push('timeout = "20m"', "");
  }
  if (!g.suites.length)
    out.push("# No test framework detected.", "# [[suite]]", '# name = "tests"', '# adapter = "generic"', '# cmd = "./run-tests.sh"', '# report = "reports/*.xml"', "");
  out.push("[run]", 'stall_timeout = "5m"', 'heartbeat = "60s"', "keep_runs = 10", "");
  return out.join(`
`);
}
function initCommand(root, json) {
  const g = guess(root);
  const dir = path12.join(root, ".witness");
  fs12.mkdirSync(dir, { recursive: true });
  const example = path12.join(dir, "witness.example.toml");
  fs12.writeFileSync(example, renderExample(g));
  const gi = path12.join(dir, ".gitignore");
  if (!fs12.existsSync(gi))
    fs12.writeFileSync(gi, `runs/
check/
cache/
up/
up.json
run.lock
scratch/
.env
`);
  else if (!/^scratch\/$/m.test(fs12.readFileSync(gi, "utf8")))
    fs12.appendFileSync(gi, `scratch/
`);
  if (json)
    process.stdout.write(JSON.stringify({ example, gitignore: gi, ...g }, null, 2) + `
`);
  else {
    process.stderr.write(`witness  wrote ${example}
`);
    for (const s of g.suites)
      process.stderr.write(`witness    suite ${s.name} (${s.adapter}): ${s.why}
`);
    for (const s of g.services)
      process.stderr.write(`witness    service ${s.name}: ${s.why}
`);
    if (!fs12.existsSync(path12.join(dir, "witness.toml")))
      process.stderr.write(`witness  review it, then: mv ${example} ${path12.join(dir, "witness.toml")}
`);
  }
  return 0;
}

// src/lint.ts
import * as fs14 from "node:fs";
import * as path14 from "node:path";

// src/plan.ts
import * as fs13 from "node:fs";
import * as path13 from "node:path";

// node_modules/yaml/dist/index.js
var composer = require_composer();
var Document = require_Document();
var Schema = require_Schema();
var errors = require_errors();
var Alias = require_Alias();
var identity = require_identity();
var Pair = require_Pair();
var Scalar = require_Scalar();
var YAMLMap = require_YAMLMap();
var YAMLSeq = require_YAMLSeq();
var cst = require_cst();
var lexer = require_lexer();
var lineCounter = require_line_counter();
var parser = require_parser();
var publicApi = require_public_api();
var visit = require_visit();
var $Composer = composer.Composer;
var $Document = Document.Document;
var $Schema = Schema.Schema;
var $YAMLError = errors.YAMLError;
var $YAMLParseError = errors.YAMLParseError;
var $YAMLWarning = errors.YAMLWarning;
var $Alias = Alias.Alias;
var $isAlias = identity.isAlias;
var $isCollection = identity.isCollection;
var $isDocument = identity.isDocument;
var $isMap = identity.isMap;
var $isNode = identity.isNode;
var $isPair = identity.isPair;
var $isScalar = identity.isScalar;
var $isSeq = identity.isSeq;
var $Pair = Pair.Pair;
var $Scalar = Scalar.Scalar;
var $YAMLMap = YAMLMap.YAMLMap;
var $YAMLSeq = YAMLSeq.YAMLSeq;
var $Lexer = lexer.Lexer;
var $LineCounter = lineCounter.LineCounter;
var $Parser = parser.Parser;
var $parse = publicApi.parse;
var $parseAllDocuments = publicApi.parseAllDocuments;
var $parseDocument = publicApi.parseDocument;
var $stringify = publicApi.stringify;
var $visit = visit.visit;
var $visitAsync = visit.visitAsync;

// src/plan.ts
var KINDS = ["new", "changed", "parity"];
var TOP_KEYS = ["version", "source", "items"];
var ITEM_KEYS = ["id", "behavior", "expect", "kind", "tests"];
function parsePlan(text, opts = {}) {
  const problems = [];
  const lc = new $LineCounter;
  const doc = $parseDocument(text, { lineCounter: lc, uniqueKeys: true });
  for (const e of doc.errors)
    problems.push({ level: "error", where: "yaml", message: e.message.split(`
`)[0], line: e.linePos?.[0]?.line });
  if (problems.length)
    return { problems };
  const lineOf = (p) => {
    const node = doc.getIn(p, true);
    return node?.range ? lc.linePos(node.range[0]).line : undefined;
  };
  const err = (where, message, p = []) => problems.push({ level: "error", where, message, line: lineOf(p) });
  const warn = (where, message, p = []) => problems.push({ level: "warning", where, message, line: lineOf(p) });
  const raw = doc.toJS();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    err("plan", "expected a mapping with version, source and items");
    return { problems };
  }
  const top = raw;
  unknownKeys(top, TOP_KEYS, "", err);
  if (top.version !== 1)
    err("version", `must be 1, got ${JSON.stringify(top.version)}`, ["version"]);
  if (typeof top.source !== "string" || !top.source.trim())
    err("source", "required: say where the expectations came from (request, PR description, issue, spec)", ["source"]);
  const items = [];
  if (!Array.isArray(top.items) || !top.items.length) {
    err("items", "required: a non-empty list of expected behaviors", ["items"]);
    return { problems };
  }
  const seen = new Map;
  top.items.forEach((it, i) => {
    const w = `items[${i}]`;
    if (!it || typeof it !== "object" || Array.isArray(it))
      return err(w, "expected a mapping", ["items", i]);
    const o = it;
    unknownKeys(o, ITEM_KEYS, w, err, ["items", i]);
    const id = typeof o.id === "string" || typeof o.id === "number" ? String(o.id).trim() : "";
    if (!id)
      err(`${w}.id`, "required, e.g. P1", ["items", i]);
    else if (!/^[A-Za-z0-9][\w.-]*$/.test(id))
      err(`${w}.id`, `"${id}": use letters, digits, '.', '_' or '-'`, ["items", i, "id"]);
    else if (seen.has(id))
      err(`${w}.id`, `"${id}" is already used by ${seen.get(id)}`, ["items", i, "id"]);
    else
      seen.set(id, w);
    for (const k of ["behavior", "expect"])
      if (typeof o[k] !== "string" || !o[k].trim())
        err(`${w}.${k}`, k === "behavior" ? "required: the behavior in one sentence" : "required: the observable result a test checks", ["items", i]);
    if (!KINDS.includes(o.kind))
      err(`${w}.kind`, `must be one of ${KINDS.join(", ")}, got ${JSON.stringify(o.kind)}`, ["items", i, "kind"]);
    let tests = [];
    if (o.tests !== undefined && (!Array.isArray(o.tests) || o.tests.some((t) => typeof t !== "string")))
      err(`${w}.tests`, "expected a list of test ids", ["items", i, "tests"]);
    else
      tests = (o.tests ?? []).map((t) => t.trim());
    const dup = tests.find((t, j) => tests.indexOf(t) !== j);
    if (dup)
      err(`${w}.tests`, `"${dup}" is listed twice`, ["items", i, "tests"]);
    tests.forEach((t, j) => {
      const colon = t.indexOf(":");
      const ad = colon > 0 ? t.slice(0, colon) : "";
      if (!(ad in ADAPTERS)) {
        const hint = ad ? closest(ad, Object.keys(ADAPTERS)) : undefined;
        err(`${w}.tests[${j}]`, `"${t}" must look like <adapter>:<id>${ad ? `; unknown adapter "${ad}"${hint ? ` (did you mean "${hint}"?)` : ""}` : ""}`, ["items", i, "tests", j]);
      } else if (!t.slice(colon + 1).trim())
        err(`${w}.tests[${j}]`, `"${t}" has no test id after the adapter`, ["items", i, "tests", j]);
    });
    if (!tests.length)
      (opts.draft ? warn : err)(`${w}.tests`, `${id || w} names no test yet`, ["items", i]);
    items.push({ id, behavior: String(o.behavior ?? ""), expect: String(o.expect ?? ""), kind: o.kind, tests, line: lineOf(["items", i]) });
  });
  if (problems.some((p) => p.level === "error"))
    return { problems };
  return { plan: { version: 1, source: top.source, items }, problems };
}
function unknownKeys(o, allowed, where, err, p = []) {
  for (const k of Object.keys(o)) {
    if (allowed.includes(k))
      continue;
    const hint = closest(k, allowed);
    err(where ? `${where}.${k}` : k, `unknown key${hint ? ` (did you mean "${hint}"?)` : ""}`, [...p, k]);
  }
}
var splitId = (t) => {
  const i = t.indexOf(":");
  return [t.slice(0, i), t.slice(i + 1).trim()];
};
var norm = (s) => s.replace(/\s+/g, " ").trim();
function idMatches(listed, wanted) {
  const a = norm(listed);
  const b = norm(wanted);
  return a === b || a.startsWith(`${b}[`) || a.startsWith(`${b}(`) || a.startsWith(`${b} (`);
}
var CLASS_HASH2 = new Set(["dotnet", "junit-maven", "junit-gradle", "phpunit", "generic"]);
var methodOnlyMatch = (adapter, listed, wanted) => CLASS_HASH2.has(adapter) && !listed.includes("#") && wanted.includes("#") && idMatches(listed, wanted.slice(wanted.lastIndexOf("#") + 1));
var lastSegment = (id) => norm(id.split(/::|#| > /).pop() ?? id).replace(/[[(].*$/, "");
function listingUrls(cfg) {
  const up = readUp2(cfg.root);
  const vars = {};
  for (const s of cfg.services) {
    const url = up?.root === cfg.root ? up.services[s.name]?.url : undefined;
    vars[`${s.name}.url`] = url ?? "http://127.0.0.1:9";
    vars[`WITNESS_${s.name.toUpperCase().replace(/-/g, "_")}_URL`] = url ?? "http://127.0.0.1:9";
  }
  return vars;
}
async function listSuites(cfg, adapters, logDir, onStart, onDone) {
  const { env } = loadEnv(cfg);
  const urls = listingUrls(cfg);
  const urlEnv = Object.fromEntries(Object.entries(urls).filter(([k]) => !k.includes(".")));
  const out = [];
  for (const s of cfg.suites.filter((x) => adapters.has(x.adapter))) {
    onStart?.(s);
    const l = await listSuiteTests(s, { root: cfg.root, cwd: path13.resolve(cfg.root, s.cwd), vars: { ...env, CHECKOUT: cfg.root, ...urls }, env: childEnv(env, urlEnv), log: path13.join(logDir, `${s.name}.list.log`), scratch: path13.join(logDir, "list", s.name) });
    const listing = { suite: s.name, adapter: s.adapter, ids: l.ids, error: l.ids ? undefined : l.error, log: l.log, source: l.source, detail: l.detail };
    onDone?.(s, listing);
    out.push(listing);
  }
  return out;
}
function matchTests(plan, cfg, listings, draft) {
  const checks = [];
  const problems = [];
  for (const item of plan.items) {
    for (const t of item.tests) {
      const [ad, id] = splitId(t);
      const where = `${item.id} ${t}`;
      if (!cfg) {
        checks.push({ item: item.id, test: t, state: "unverified", suites: [], detail: "no witness.toml" });
        continue;
      }
      const owners = cfg.suites.filter((s) => s.adapter === ad);
      if (!owners.length) {
        checks.push({ item: item.id, test: t, state: "missing", suites: [] });
        problems.push({ level: "error", where, message: `no suite uses the ${ad} adapter (suites: ${cfg.suites.map((s) => `${s.name}/${s.adapter}`).join(", ") || "none"})`, line: item.line });
        continue;
      }
      const ls = listings.filter((l) => l.adapter === ad);
      const listed = ls.filter((l) => l.ids);
      const hits = listed.filter((l) => l.ids.some((x) => idMatches(x, id))).map((l) => l.suite);
      if (hits.length) {
        const old = listed.find((l) => hits.includes(l.suite) && l.source === "last-report");
        checks.push({ item: item.id, test: t, state: "found", suites: hits, ...old ? { detail: old.detail } : {} });
        continue;
      }
      const loose = listed.filter((l) => l.ids.some((x) => methodOnlyMatch(ad, x, id))).map((l) => l.suite);
      if (loose.length) {
        checks.push({ item: item.id, test: t, state: "found", suites: loose, detail: "matched on the method name only: this suite lists tests without class names" });
        continue;
      }
      if (!listed.length) {
        const why = ls.map((l) => `${l.suite}: ${l.error}`).join("; ");
        checks.push({ item: item.id, test: t, state: "unverified", suites: owners.map((s) => s.name), detail: why });
        problems.push({ level: "warning", where, message: `can't confirm it exists (${why})`, line: item.line });
        continue;
      }
      const seg = lastSegment(id);
      const near = listed.flatMap((l) => l.ids.filter((x) => (!CLASS_HASH2.has(ad) || x.includes("#")) && lastSegment(x) === seg).map((x) => `${ad}:${x}`)).slice(0, 3);
      const n = listed.reduce((a, l) => a + l.ids.length, 0);
      checks.push({ item: item.id, test: t, state: "missing", suites: [] });
      problems.push({
        level: draft ? "warning" : "error",
        where,
        message: `${draft ? "not written yet: " : ""}not in the test listing of ${listed.map((l) => l.suite).join(", ")} (${n} tests)${near.length ? `; did you mean ${near.map((x) => `"${x}"`).join(" or ")}?` : ""}`,
        line: item.line
      });
    }
  }
  return { checks, problems };
}
function readPlanFile(file) {
  if (!fs13.existsSync(file))
    throw new Error(`${file} does not exist`);
  return fs13.readFileSync(file, "utf8");
}
async function planCheckCommand(file, cfg, o) {
  let text;
  try {
    text = readPlanFile(file);
  } catch (e) {
    o.log(`plan  ${e.message}`);
    if (o.json)
      process.stdout.write(JSON.stringify({ ok: false, file, problems: [{ level: "error", where: "file", message: e.message }] }, null, 2) + `
`);
    return 2;
  }
  const rel = path13.relative(process.cwd(), file) || file;
  const { plan, problems } = parsePlan(text, { draft: o.draft });
  let checks = [];
  let listingsOut = [];
  if (plan) {
    const adapters = new Set(plan.items.flatMap((i) => i.tests.map((t) => splitId(t)[0])));
    let listings = [];
    if (cfg && o.list && adapters.size) {
      listings = await listSuites(cfg, adapters, path13.join(cfg.root, ".witness", "check", "plan"), (s) => o.log(`plan  listing tests of suite ${s.name} (${s.adapter}) ...`), (s, l) => o.log(`plan  suite ${s.name}: ${l.ids ? `${l.ids.length} test(s) · ` : ""}${l.detail}`));
    } else if (cfg && !o.list) {
      listings = cfg.suites.filter((s) => adapters.has(s.adapter)).map((s) => ({ suite: s.name, adapter: s.adapter, error: "listing skipped (--no-list)" }));
    }
    listingsOut = listings;
    const m = matchTests(plan, cfg, listings, o.draft);
    checks = m.checks;
    problems.push(...m.problems);
    if (!cfg)
      problems.push({ level: "warning", where: "config", message: "no .witness/witness.toml found, so referenced tests were not checked" });
  }
  const errors2 = problems.filter((p) => p.level === "error");
  for (const p of problems)
    o.log(`plan  ${p.level === "error" ? "ERROR" : "warn "} ${rel}${p.line ? `:${p.line}` : ""} ${p.where}: ${p.message}`);
  if (plan) {
    for (const c2 of checks.filter((c3) => c3.state === "found"))
      o.log(`plan  ok    ${c2.item} ${c2.test} (suite ${c2.suites.join(", ")}${c2.detail ? `; ${c2.detail}` : ""})`);
    for (const i of plan.items.filter((i2) => !i2.tests.length))
      o.log(`plan  todo  ${i.id} ${i.behavior}`);
  }
  const found = checks.filter((c2) => c2.state === "found");
  if (found.length)
    o.log(`plan  run the plan's tests: witness run --select ${shq([...new Set(found.map((c2) => `${c2.suites[0]}:${c2.test}`))].join(","))}`);
  const count = (s) => checks.filter((c2) => c2.state === s).length;
  const summary = plan ? `${plan.items.length} item(s), ${checks.length} test ref(s): ${count("found")} found, ${count("missing")} missing, ${count("unverified")} unverified` : `${errors2.length} error(s)`;
  o.log(`PLAN ${errors2.length ? "invalid" : "ok"} · ${summary}`);
  if (o.json)
    process.stdout.write(JSON.stringify({ ok: !errors2.length, file, items: plan?.items ?? [], tests: checks, problems, listings: listingsOut.map((l) => ({ suite: l.suite, adapter: l.adapter, source: l.source, detail: l.detail, ids: l.ids, error: l.error })) }, null, 2) + `
`);
  return errors2.length ? 1 : 0;
}

// src/lint.ts
var EXT = {
  ".py": "py",
  ".js": "js",
  ".jsx": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".ts": "js",
  ".tsx": "js",
  ".mts": "js",
  ".cts": "js",
  ".cs": "cs",
  ".java": "java",
  ".kt": "java",
  ".kts": "java",
  ".go": "go",
  ".rb": "rb",
  ".php": "php"
};
var langOf = (file) => EXT[path14.extname(file).toLowerCase()];
var TEST_PATH = [/(^|\/)[^/]*(tests?|specs?|__tests__|e2e)\//i, /([._-](test|spec)s?|Tests?|IT)\.[a-z]+$/, /(^|\/)test_[^/]*\.py$/, /_(test|spec)\.(go|py|rb)$/];
var isTestPath = (rel) => !!langOf(rel) && TEST_PATH.some((re) => re.test(rel.replace(/\\/g, "/")));
function mask(src, lang) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => {
    for (let k = a;k < b && k < n; k++)
      if (out[k] !== `
`)
        out[k] = " ";
  };
  const hash = lang === "py" || lang === "rb" || lang === "php";
  const slash = lang !== "py" && lang !== "rb";
  let i = 0;
  while (i < n) {
    const c2 = src[i];
    const c22 = src.slice(i, i + 2);
    if (slash && c22 === "//") {
      const e = src.indexOf(`
`, i);
      blank(i, e < 0 ? n : e);
      i = e < 0 ? n : e;
    } else if (slash && c22 === "/*") {
      const e = src.indexOf("*/", i + 2);
      blank(i, e < 0 ? n : e + 2);
      i = e < 0 ? n : e + 2;
    } else if (hash && c2 === "#" && !(lang === "php" && src[i + 1] === "[")) {
      const e = src.indexOf(`
`, i);
      blank(i, e < 0 ? n : e);
      i = e < 0 ? n : e;
    } else if ((lang === "py" || lang === "cs") && (src.startsWith('"""', i) || lang === "py" && src.startsWith("'''", i))) {
      const q2 = src.slice(i, i + 3);
      const e = src.indexOf(q2, i + 3);
      blank(i, e < 0 ? n : e + 3);
      i = e < 0 ? n : e + 3;
    } else if (lang === "cs" && c22 === '@"') {
      let j = i + 2;
      while (j < n && !(src[j] === '"' && src[j + 1] !== '"'))
        j += src[j] === '"' ? 2 : 1;
      blank(i + 2, j);
      i = j + 1;
    } else if (lang === "js" && c2 === "/" && regexAllowed(src, i)) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== `
` && (cls || src[j] !== "/")) {
        if (src[j] === "\\")
          j++;
        else if (src[j] === "[")
          cls = true;
        else if (src[j] === "]")
          cls = false;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c2 === '"' || c2 === "'" || c2 === "`" && (lang === "js" || lang === "go")) {
      const raw = c2 === "`" && lang === "go";
      let j = i + 1;
      while (j < n && src[j] !== c2) {
        if (src[j] === "\\" && !raw)
          j++;
        else if (src[j] === `
` && c2 !== "`")
          break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else
      i++;
  }
  return out.join("");
}
function regexAllowed(src, i) {
  if (src[i + 1] === "/" || src[i + 1] === "*" || src[i + 1] === ">")
    return false;
  let k = i - 1;
  while (k >= 0 && (src[k] === " " || src[k] === "\t"))
    k--;
  if (k < 0 || src[k] === `
`)
    return true;
  if (src[k] === ">")
    return src[k - 1] === "=";
  if ("(,=:[!&|?{};+-*%~^".includes(src[k]))
    return true;
  return /\b(return|typeof|case|in|of|delete|void|throw|new|yield|await)$/.test(src.slice(Math.max(0, k - 7), k + 1));
}
function matchBracket(code, open) {
  const o = code[open];
  const cl = o === "(" ? ")" : o === "{" ? "}" : "]";
  let depth = 0;
  for (let k = open;k < code.length; k++) {
    if (code[k] === o)
      depth++;
    else if (code[k] === cl && --depth === 0)
      return k;
  }
  return -1;
}
var lineAt = (text, idx) => {
  let l = 1;
  for (let k = 0;k < idx && k < text.length; k++)
    if (text[k] === `
`)
      l++;
  return l;
};
var indentOf = (line) => line.length - line.trimStart().length;
function indentBlockEnd(code, at, ruby) {
  const lineStart = code.lastIndexOf(`
`, at) + 1;
  const ind = indentOf(code.slice(lineStart, code.indexOf(`
`, at) < 0 ? code.length : code.indexOf(`
`, at)));
  let pos = code.indexOf(`
`, at);
  if (pos < 0)
    return code.length;
  let paren = 0;
  for (let k = lineStart;k < pos; k++)
    paren += code[k] === "(" ? 1 : code[k] === ")" ? -1 : 0;
  while (pos < code.length) {
    const next = code.indexOf(`
`, pos + 1);
    const line = code.slice(pos + 1, next < 0 ? code.length : next);
    const open = paren > 0;
    for (const ch of line)
      paren += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    if (line.trim() && !open && indentOf(line) <= ind)
      return ruby && /^\s*end\b/.test(line) ? next < 0 ? code.length : next : pos;
    if (next < 0)
      return code.length;
    pos = next;
  }
  return code.length;
}
function bodyAfter(code, from) {
  const lead = /^\s*(=>|=(?!=))?/.exec(code.slice(from));
  if (lead[1] === "=>") {
    let depth = 0;
    for (let k = from + lead[0].length;k < code.length; k++) {
      const ch = code[k];
      if (ch === "(" || ch === "{" || ch === "[")
        depth++;
      else if (ch === ")" || ch === "}" || ch === "]")
        depth--;
      else if (ch === ";" && depth <= 0)
        return [from, k + 1];
    }
    return null;
  }
  const brace = code.indexOf("{", from);
  const semi = code.indexOf(";", from);
  if (brace < 0 || semi >= 0 && semi < brace)
    return null;
  const end = matchBracket(code, brace);
  return end < 0 ? null : [brace, end + 1];
}
function findTests(raw, code, lang) {
  const blocks = [];
  const add = (name, at, start, end, skipped = false) => {
    if (!blocks.some((b) => b.start === start))
      blocks.push({ name, line: lineAt(code, at), start, end, skipped });
  };
  let m;
  if (lang === "py") {
    const re = /^([ \t]*)(?:async\s+)?def\s+(test\w*)\s*\(/gm;
    while (m = re.exec(code)) {
      const before = code.slice(Math.max(0, m.index - 400), m.index).split(`
`).slice(-4).join(`
`);
      add(m[2], m.index, m.index, indentBlockEnd(code, m.index, false), /@(pytest\.mark\.skip|unittest\.skip)/.test(before));
    }
  } else if (lang === "rb") {
    const re = /^([ \t]*)(?:(it|specify|scenario|example|test)\b\s*\(?\s*(['"])|def\s+(test_\w+))/gm;
    while (m = re.exec(code)) {
      const lineEnd = code.indexOf(`
`, m.index);
      const header = code.slice(m.index, lineEnd < 0 ? code.length : lineEnd);
      const rawHeader = raw.slice(m.index, lineEnd < 0 ? raw.length : lineEnd);
      const title = m[4] ?? (/(['"])(.*?)\1/.exec(rawHeader)?.[2] ?? "");
      if (!m[4] && !/\bdo\b|\{/.test(header))
        continue;
      const brace = !m[4] && !/\bdo\b/.test(header) ? code.indexOf("{", m.index) : -1;
      const end = brace >= 0 ? matchBracket(code, brace) + 1 : indentBlockEnd(code, m.index, true);
      add(title, m.index, m.index, end, /^\s*x(it|specify)|skip/.test(header));
    }
  } else if (lang === "js") {
    const re = /(?<![\w.$])(it|test)((?:\.(?:only|skip|concurrent|fixme|fail|failing|slow|todo))*)\s*\(\s*(['"`])/g;
    while (m = re.exec(code)) {
      const open = code.indexOf("(", m.index + m[1].length + m[2].length);
      const close = matchBracket(code, open);
      if (close < 0)
        continue;
      const q2 = open + 1 + (code.slice(open + 1).length - code.slice(open + 1).trimStart().length);
      const qEnd = code.indexOf(raw[q2], q2 + 1);
      add(raw.slice(q2 + 1, qEnd), m.index, open, close + 1, /skip|todo|fixme/.test(m[2]));
    }
  } else if (lang === "go") {
    const re = /\bfunc\s+(Test\w*)\s*\(\s*\w+\s+\*testing\.T\s*\)/g;
    while (m = re.exec(code)) {
      const b = bodyAfter(code, m.index + m[0].length);
      if (b)
        add(m[1], m.index, b[0], b[1]);
    }
  } else {
    const re = lang === "cs" ? /\[\s*(?:Xunit\.|NUnit\.Framework\.)?(Fact|Theory|Test|TestMethod|DataTestMethod|TestCase|TestCaseSource|SkippableFact|SkippableTheory)\b(\([^\]]*\))?\s*(?:,[^\]]*)?\]/g : lang === "java" ? /@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b(\([^)]*\))?/g : /(#\[\s*Test\s*\]|@test\b)|\bfunction\s+(test\w*)\s*\(/g;
    while (m = re.exec(code)) {
      let k = m.index + m[0].length;
      let name;
      if (lang === "php" && m[2]) {
        name = m[2];
        k = m.index + m[0].length - 1;
      } else {
        const sig = /^(?:\s*(?:\[[^\]]*\]|@\w+(?:\([^)]*\))?|#\[[^\]]*\]))*[^;{(=]*?(\w+|`[^`]+`)\s*\(/.exec(code.slice(k));
        if (!sig)
          continue;
        name = sig[1].replace(/`/g, "");
        k += sig[0].length - 1;
      }
      if (lang === "php" && m[1] && !/function\s+\w+\s*\($/.test(code.slice(m.index, k + 1)))
        continue;
      const close = matchBracket(code, k);
      if (close < 0)
        continue;
      const b = bodyAfter(code, close + 1);
      if (!b)
        continue;
      const rawSig = raw.slice(m.index, b[0]);
      add(name, m.index, b[0], b[1], /\bSkip\s*=|@Disabled|@Ignore|\[Ignore\]/.test(rawSig));
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}
var COMMON_ASSERT = /\b(assert|verify|expect|should)(?!ed\b|ation)\w*\s*[(!<]|\b(assert|expect|should)\s*\.|\bassert\b|\bEnsureSuccess\w*\s*\(|\bfail\s*\(|\bthrow\s+new\s+\w*(Error|Exception)\b|\braise\s+\w*(Error|Exception)\b/i;
var LANG_ASSERT = {
  py: /\bpytest\.(raises|fail|warns)\b|\.assert_\w+\s*\(|\bself\.fail\w*\(/,
  js: /\bt\.(is|not|deepEqual|true|false|truthy|falsy|throws\w*|equal|ok|same|match|regex|like|snapshot|pass|fail|notOk)\s*\(|\.should\b|\bfind(All)?By\w+\s*\(/,
  cs: /\.Should\w*\(|\bShould\.\w+|\.(Received|DidNotReceive|ReceivedWithAnyArgs|DidNotReceiveWithAnyArgs)\s*[(<]|\bMustHaveHappened\w*\(|\bMustNotHaveHappened\w*\(/,
  java: /\bandExpect\s*\(|\.expect\w*\s*\(|\bverify\s*\(/,
  go: /\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\b(assert|require)\.\w+\s*\(/,
  rb: /\bexpect\s*\{|\bis_expected\b|\bmust_\w+|\bwont_\w+|\bshould\b|\bflunk\b/,
  php: /\$this->(assert|expect)\w*\s*\(|(self|static)::(assert|expect|fail)\w*\s*\(/
};
var hasAssert = (code, lang) => COMMON_ASSERT.test(code) || LANG_ASSERT[lang].test(code);
function assertingHelpers(code, lang, tests) {
  const defs = [];
  let m;
  if (lang === "py" || lang === "rb") {
    const re = /^[ \t]*(?:async\s+)?def\s+(?:self\.)?(\w+[?!]?)/gm;
    while (m = re.exec(code))
      defs.push({ name: m[1], body: code.slice(m.index, indentBlockEnd(code, m.index, lang === "rb")) });
  } else {
    const re = lang === "js" ? /\b(?:function\s*\*?\s*(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b[^(]*\(|\([^)]*\)\s*(?::\s*[^=]+)?=>|\w+\s*=>))/g : lang === "go" ? /\bfunc\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/g : lang === "php" ? /\bfunction\s+(\w+)\s*\(/g : /\b(\w+)\s*\([^;{}()]*(?:\([^)]*\)[^;{}()]*)*\)\s*(?:throws\s+[\w.,\s]+)?\{/g;
    while (m = re.exec(code)) {
      const name = m[1] ?? m[2];
      if (!name || /^(if|for|while|switch|catch|using|lock|foreach|return|new|function)$/.test(name))
        continue;
      const b = bodyAfter(code, lang === "cs" || lang === "java" ? m.index + m[0].length - 1 : m.index + m[0].length);
      if (b)
        defs.push({ name, body: code.slice(b[0], b[1]) });
    }
  }
  const testStarts = new Set(tests.map((t) => t.name));
  const helpers = new Set;
  for (let round = 0;round < 3; round++) {
    for (const d of defs) {
      if (testStarts.has(d.name) || helpers.has(d.name))
        continue;
      if (hasAssert(d.body, lang) || [...helpers].some((h) => callsName(d.body, h)))
        helpers.add(d.name);
    }
  }
  return helpers;
}
var callsName = (body, name) => new RegExp(`(?<![\\w$])${name.replace(/[?!$]/g, "\\$&")}\\s*[(<]`).test(body);
var num = (s) => Number(s.replace(/_/g, "").replace(/[lLfFdDmM]$/, ""));
var UNIT = { Millisecond: 0.001, Milliseconds: 0.001, MILLISECONDS: 0.001, Second: 1, Seconds: 1, SECONDS: 1, Minute: 60, Minutes: 60, MINUTES: 60, Hour: 3600, Hours: 3600, HOURS: 3600 };
var SLEEPS = {
  py: [
    { re: /(?:\bawait\s+(?:asyncio\.|anyio\.|trio\.)?|(?<![\w.])time\.|^\s*|[;=]\s*)sleep\s*\(\s*([\d_.]+)\s*\)/gm, seconds: (m) => num(m[1]) },
    { re: /\bwait_for_timeout\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 }
  ],
  js: [
    { re: /\bsetTimeout\s*\([^,]*,\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\bwaitForTimeout\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\b(?:sleep|delay|wait)\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 }
  ],
  cs: [
    { re: /\b(?:Thread\.Sleep|Task\.Delay|WaitForTimeoutAsync)\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\b(?:Thread\.Sleep|Task\.Delay)\s*\(\s*TimeSpan\.From(Milliseconds|Seconds|Minutes|Hours)\s*\(\s*([\d_.]+)/g, seconds: (m) => num(m[2]) * UNIT[m[1]] }
  ],
  java: [
    { re: /\bThread\.sleep\s*\(\s*([\d_.]+[lL]?)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\bTimeUnit\.(MILLISECONDS|SECONDS|MINUTES|HOURS)\.sleep\s*\(\s*([\d_.]+)/g, seconds: (m) => num(m[2]) * UNIT[m[1]] },
    { re: /\bThread\.sleep\s*\(\s*Duration\.of(Millis|Seconds|Minutes)\s*\(\s*([\d_.]+)/g, seconds: (m) => num(m[2]) * (m[1] === "Millis" ? 0.001 : UNIT[m[1]]) },
    { re: /(?<![\w.])delay\s*\(\s*([\d_.]+[lL]?)\s*\)/g, seconds: (m) => num(m[1]) / 1000 }
  ],
  go: [
    { re: /\btime\.Sleep\s*\(\s*([\d_.]+)\s*\*\s*time\.(Millisecond|Second|Minute|Hour)\b/g, seconds: (m) => num(m[1]) * UNIT[m[2]] },
    { re: /\btime\.Sleep\s*\(\s*time\.(Millisecond|Second|Minute|Hour)\s*(?:\*\s*([\d_.]+))?\s*\)/g, seconds: (m) => (m[2] ? num(m[2]) : 1) * UNIT[m[1]] }
  ],
  rb: [{ re: /(?<![\w.])sleep[\s(]+([\d_.]+)/g, seconds: (m) => num(m[1]) }],
  php: [
    { re: /(?<![\w>:])sleep\s*\(\s*(\d+)\s*\)/g, seconds: (m) => num(m[1]) },
    { re: /\busleep\s*\(\s*([\d_]+)\s*\)/g, seconds: (m) => num(m[1]) / 1e6 }
  ]
};
var MAX_SLEEP_S = 5;
var NO_RAISE = /\b(not?|never|doesn'?t|does not|must not|should not|won'?t)[ _]+(raises?|throws?|propagates?|fails?)\b|\bno[ _](raise|throw|exception)\b|does_?not_?(raise|throw)|DoesNotThrow|never_?raises?|swallow|survivable/i;
function nestedFunctions(code, lang, t) {
  const spans = [];
  const body = code.slice(t.start, t.end);
  let m;
  if (lang === "py" || lang === "rb") {
    const re2 = /^[ \t]*(?:async\s+)?def\s+\w+/gm;
    re2.lastIndex = body.indexOf(`
`) + 1;
    while (m = re2.exec(body))
      spans.push([t.start + m.index, indentBlockEnd(code, t.start + m.index, lang === "rb")]);
    return spans;
  }
  const re = lang === "go" ? /\bfunc\s*\([^)]*\)[^{\n]*\{/g : /=>\s*\{|\bfunction\b[^{]*\{|\bdelegate\b[^{]*\{/g;
  let first = lang === "js";
  while (m = re.exec(body)) {
    if (first) {
      first = false;
      continue;
    }
    const open = t.start + m.index + m[0].length - 1;
    const close = matchBracket(code, open);
    if (close > 0)
      spans.push([open, close]);
  }
  return spans;
}
function blanketCatches(code, lang, from, to) {
  const seg = code.slice(from, to);
  const hits = [];
  let m;
  if (lang === "py") {
    const re = /^([ \t]*)except\s*(?:\(?\s*(?:Exception|BaseException)\b[^:\n]*)?:[ \t]*(.*)$/gm;
    while (m = re.exec(seg))
      hits.push({ at: from + m.index, handler: m[2] + code.slice(from + m.index + m[0].length, indentBlockEnd(code, from + m.index, false)) });
    const sup = /\bsuppress\s*\(\s*(?:Exception|BaseException)\s*\)/g;
    while (m = sup.exec(seg))
      hits.push({ at: from + m.index, handler: "" });
  } else if (lang === "rb") {
    const re = /^([ \t]*)rescue(?:\s+(?:StandardError|Exception))?(?:\s*=>\s*\w+)?[ \t]*$/gm;
    while (m = re.exec(seg)) {
      const ind = m[1].length;
      const rest = code.slice(from + m.index + m[0].length).split(`
`).slice(1);
      const body = [];
      for (const l of rest) {
        if (l.trim() && indentOf(l) <= ind)
          break;
        body.push(l);
      }
      hits.push({ at: from + m.index, handler: body.join(`
`) });
    }
    const mod = /\S[^\n]*?\brescue\s+nil\b/g;
    while (m = mod.exec(seg))
      hits.push({ at: from + m.index, handler: "" });
  } else if (lang !== "go") {
    const re = lang === "js" ? /\bcatch\s*(?:\([^)]*\))?\s*\{/g : lang === "cs" ? /\bcatch\s*(?:\(\s*(?:System\.)?Exception(?:\s+\w+)?\s*\))?\s*(?:when\s*\([^)]*\)\s*)?\{/g : lang === "java" ? /\bcatch\s*\(\s*(?:final\s+)?(?:\w+\s*:\s*)?(?:java\.lang\.)?(?:Exception|Throwable|RuntimeException|Error)(?:\s+\w+)?\s*\)\s*\{/g : /\bcatch\s*\(\s*\\?(?:Exception|Throwable|Error)(?:\s+\$\w+)?\s*\)\s*\{/g;
    while (m = re.exec(seg)) {
      const open = from + m.index + m[0].length - 1;
      hits.push({ at: from + m.index, handler: code.slice(open, matchBracket(code, open) + 1) });
    }
    if (lang === "js") {
      const pc = /\.catch\s*\(\s*(?:async\s*)?\(?\s*(\w*)[^)=]*\)?\s*=>\s*/g;
      while (m = pc.exec(seg)) {
        const k = from + m.index + m[0].length;
        const close = matchBracket(code, code.indexOf("(", from + m.index));
        const handler = code[k] === "{" ? code.slice(k, matchBracket(code, k) + 1) : code.slice(k, close);
        if (m[1] && handler.trim() === m[1])
          continue;
        hits.push({ at: from + m.index, handler });
      }
      const noop = /\.catch\s*\(\s*(?:noop|_\.noop|\(\)\s*=>\s*\{\s*\})\s*\)/g;
      while (m = noop.exec(seg))
        if (!hits.some((h) => h.at === from + m.index))
          hits.push({ at: from + m.index, handler: "" });
    }
  }
  return hits;
}
var RETHROWS = /\bthrow\b|\braise\b|\bfail\w*\s*[(!]|\bflunk\b|\breject\s*\(|\bskip\w*\s*\(|\bt\.Skip/i;
var RECORDS = /\.(append|add|push|put|put_nowait|set_exception|Add|Enqueue|offer)\s*\(/;
var ERR_STATUS = [
  /\b(status|code|statuscode|status_code)\w*\b[^\n]*\b[45]\d\d\b|\b[45]\d\d\b[^\n]*\b(status|code)/i,
  /HttpStatusCode\.(BadRequest|Unauthorized|Forbidden|NotFound|MethodNotAllowed|Conflict|Gone|UnprocessableEntity|UnprocessableContent|TooManyRequests|InternalServerError|NotImplemented|BadGateway|ServiceUnavailable|GatewayTimeout)\b/,
  /HttpStatus\.(BAD_REQUEST|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|METHOD_NOT_ALLOWED|CONFLICT|GONE|UNPROCESSABLE_ENTITY|TOO_MANY_REQUESTS|INTERNAL_SERVER_ERROR|SERVICE_UNAVAILABLE)\b|\bstatus\.HTTP_[45]\d\d|\bis[45]xx\w*\(|\bis(Client|Server)Error\b/,
  /\bhave_http_status\(\s*:(bad_request|unauthorized|forbidden|not_found|conflict|unprocessable_entity|internal_server_error)/,
  /\b(ok|IsSuccessStatusCode|is_success|successful)\b[^\n]*\b(false|False|toBeFalsy|IsFalse|assertFalse)\b|\bassert\s+not\s+\w+\.ok\b|\b(IsFalse|assertFalse)\s*\([^\n]*\b(ok|IsSuccessStatusCode)\b/
];
var OK_STATUS = [
  /\bEnsureSuccess\w*\s*\(|\braise_for_status\s*\(/,
  /\b(status|code|statuscode|status_code)\w*\b[^\n]*\b2\d\d\b|\b2\d\d\b[^\n]*\b(status|code)/i,
  /HttpStatusCode\.(OK|Created|Accepted|NoContent)\b|HttpStatus\.(OK|CREATED|ACCEPTED|NO_CONTENT)\b|\bstatus\.HTTP_2\d\d|\bis2xx\w*\(|\bisSuccessful\b/,
  /\bhave_http_status\(\s*:(ok|success|created|accepted|no_content)/,
  /\btoBeOK\(\)|\btoHaveStatus\(\s*2\d\d|\b(ok|IsSuccessStatusCode|is_success|successful)\b[^\n]*\b(true|True|toBeTruthy|IsTrue|assertTrue)\b|\bassert\s+\w+\.ok\b|\b(IsTrue|assertTrue)\s*\([^\n]*\b(ok|IsSuccessStatusCode)\b/
];
var STATUS_ONLY_EXPECT = /^\s*(returns?|responds?( with)?|gets?|is)?\s*(HTTP\s*)?([1-5]\d\d|[1-5]xx)(\s+[A-Za-z ]{1,20})?\s*\.?\s*$|^\s*(ok|success(ful)?|succeeds)\s*\.?\s*$/i;
var CLASS_LANGS = new Set(["cs", "java", "php"]);
function enclosingClass(code, at) {
  let name;
  const re = /\b(?:class|record|object)\s+(\w+)/g;
  let m;
  while ((m = re.exec(code)) && m.index < at)
    name = m[1];
  return name;
}
var EXPECTS_FAILURE = /\b[45]\d\d\b|\b[45]xx\b|error|fail|reject|refus|den(y|ied)|forbidden|unauthori[sz]ed|not found|invalid|conflict|bad request|throws?\b|exception|not allowed|blocked/i;
var expectsSuccess = (item) => !EXPECTS_FAILURE.test(`${item.expect}`);
var lastSegment2 = (id) => (id.split(/::|#| > /).pop() ?? id).replace(/[[(].*$/, "").trim();
function planFiles(plan, root, roots = []) {
  const out = new Set;
  const bases = [root, ...roots.map((r) => path14.resolve(root, r))];
  let all;
  for (const t of plan.items.flatMap((i) => i.tests)) {
    const [, id] = splitId(t);
    const file = id.includes("::") ? id.split("::")[0] : id.includes(" > ") ? id.split(" > ")[0] : undefined;
    if (file) {
      for (const b of bases)
        if (fs14.existsSync(path14.join(b, file)))
          out.add(path14.join(b, file));
      continue;
    }
    const cls = id.split("#")[0].split(".").pop();
    if (!cls || !id.includes("#"))
      continue;
    all ??= globFiles(root, ["**/*.{cs,java,kt,php,go}"], { maxDepth: 8, skipDirs: new Set([".git", "node_modules", "bin", "obj", "target", "build", "dist", "vendor", ".witness"]) });
    for (const f of all)
      if (path14.basename(f).replace(/\.\w+$/, "") === cls && isTestPath(f))
        out.add(path14.join(root, f));
  }
  return [...out];
}
var IGNORE = /witness-lint:\s*ignore(?:\[([\w,\s-]+)\]|=([\w,-]+))?/;
function suppressed(rawLines, line, rule) {
  for (const l of [rawLines[line - 1], rawLines[line - 2]]) {
    const m = l ? IGNORE.exec(l) : null;
    if (!m)
      continue;
    const list = (m[1] ?? m[2])?.split(/[,\s]+/).filter(Boolean);
    if (!list || list.includes(rule))
      return true;
  }
  return false;
}
function lintSource(file, raw, opts = {}) {
  const lang = langOf(file);
  if (!lang)
    return { findings: [], tests: [] };
  const code = mask(raw, lang);
  const rel = opts.rel ?? file;
  const rawLines = raw.split(`
`);
  const tests = findTests(raw, code, lang);
  const helpers = assertingHelpers(code, lang, tests);
  const findings = [];
  const push = (f) => {
    if (!suppressed(rawLines, f.line, f.rule))
      findings.push({ file: rel, ...f });
  };
  for (const t of tests) {
    const body = code.slice(t.start, t.end);
    if (!t.skipped && !hasAssert(body, lang) && ![...helpers].some((h) => callsName(body, h))) {
      const noRaise = NO_RAISE.test(`${t.name}
${raw.slice(t.start, t.end)}`);
      push({
        line: t.line,
        rule: "no-assertion",
        level: noRaise ? "warning" : "error",
        test: t.name,
        message: noRaise ? `test "${t.name}" only checks that nothing raises: also assert the result or side effect if there is one` : `test "${t.name}" asserts nothing: check the observable result (response body, stored state, rendered text)`
      });
    }
    const nestedFns = nestedFunctions(code, lang, t);
    for (const h of blanketCatches(code, lang, t.start, t.end))
      if (!nestedFns.some(([a, b]) => h.at > a && h.at < b) && !RETHROWS.test(h.handler) && !hasAssert(h.handler, lang) && !RECORDS.test(h.handler))
        push({ line: lineAt(code, h.at), rule: "swallowed-exception", level: "error", test: t.name, message: `test "${t.name}" catches every exception and carries on, so a failure can pass: catch the specific exception or let it fail the test` });
  }
  for (const t of tests) {
    const nested = nestedFunctions(code, lang, t);
    for (const p of SLEEPS[lang]) {
      const re = new RegExp(p.re.source, p.re.flags);
      re.lastIndex = t.start;
      let m;
      while ((m = re.exec(code)) && m.index < t.end) {
        const s = p.seconds(m);
        if (!Number.isFinite(s) || s <= MAX_SLEEP_S || nested.some(([a, b]) => m.index > a && m.index < b))
          continue;
        push({ line: lineAt(code, m.index), rule: "long-sleep", level: "error", test: t.name, message: `test "${t.name}" sleeps ${+s.toFixed(3)}s (over ${MAX_SLEEP_S}s): wait for the condition instead (poll with a timeout, or the framework's wait/expect)` });
      }
    }
  }
  if (opts.plan) {
    for (const item of opts.plan.items) {
      const wantsSuccess = expectsSuccess(item);
      for (const tid of item.tests) {
        const [, id] = splitId(tid);
        const fileHint = id.includes("::") ? id.split("::")[0] : id.includes(" > ") ? id.split(" > ")[0] : undefined;
        if (fileHint && !rel.replace(/\\/g, "/").endsWith(fileHint.replace(/^\.\//, "")))
          continue;
        const name = lastSegment2(id);
        const cls = CLASS_LANGS.has(lang) && id.includes("#") ? id.split("#")[0].split(".").pop().split(/[+$]/).pop() : undefined;
        for (const t of tests.filter((x) => x.name.trim() === name && (!cls || enclosingClass(code, x.start) === cls))) {
          const lines = code.slice(t.start, t.end).split(`
`);
          const asserting = lines.filter((l) => hasAssert(l, lang));
          if (!asserting.length)
            continue;
          const isErr = (l) => ERR_STATUS.some((re) => re.test(l));
          if (wantsSuccess && asserting.every(isErr))
            push({ line: t.line, rule: "error-status-only", level: "error", test: t.name, message: `${item.id} expects "${item.expect}", but test "${t.name}" only asserts an error status: assert the success result` });
          else if (!STATUS_ONLY_EXPECT.test(item.expect) && asserting.every((l) => isErr(l) || OK_STATUS.some((re) => re.test(l))))
            push({ line: t.line, rule: "status-only", level: "error", test: t.name, message: `${item.id} expects "${item.expect}", but test "${t.name}" only checks the status code: assert what the item expects (body, rendered text, stored state)` });
        }
      }
    }
  }
  return { findings: findings.sort((a, b) => a.line - b.line), tests };
}
function changedTestFiles(root) {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok)
    return [];
  const base = top.out.trim();
  const names = [...git(base, ["diff", "--name-only", "HEAD"]).out.split(`
`), ...git(base, ["ls-files", "--others", "--exclude-standard"]).out.split(`
`)];
  return [...new Set(names.map((s) => s.trim()).filter((s) => s && isTestPath(s)))].map((s) => path14.join(base, s)).filter((f) => fs14.existsSync(f));
}
function expandArgs(args, cwd) {
  const out = [];
  for (const a of args) {
    const abs = path14.resolve(cwd, a);
    if (fs14.existsSync(abs) && fs14.statSync(abs).isDirectory()) {
      const skip = new Set([".git", "node_modules", "bin", "obj", "target", "build", "dist", "vendor", ".witness", ".venv", "venv"]);
      for (const f of globFiles(abs, ["**/*"], { maxDepth: 12, skipDirs: skip })) {
        const full = path14.isAbsolute(f) ? f : path14.join(abs, f);
        if (isTestPath(path14.join(path14.basename(abs), f)))
          out.push(full);
      }
    } else
      out.push(abs);
  }
  return [...new Set(out)];
}
function lintCommand(o) {
  let files = expandArgs(o.files, o.cwd);
  let from = "arguments";
  if (!o.files.length) {
    files = [...new Set([...changedTestFiles(o.root), ...o.plan ? planFiles(o.plan, o.root, o.suiteCwds) : []])];
    from = o.plan ? "changed test files and the plan's tests" : "changed test files";
  }
  const findings = [];
  let tests = 0;
  const linted = [];
  for (const f of files) {
    const rel = path14.relative(o.cwd, f) || f;
    if (!langOf(f)) {
      if (o.files.length)
        o.log(`lint  skip  ${rel} (not a supported language)`);
      continue;
    }
    let raw;
    try {
      raw = fs14.readFileSync(f, "utf8");
    } catch (e) {
      o.log(`lint  skip  ${rel}: ${e.message}`);
      continue;
    }
    const r = lintSource(f, raw, { plan: o.plan, rel });
    linted.push(rel);
    tests += r.tests.length;
    findings.push(...r.findings);
  }
  if (!linted.length) {
    o.log(`LINT ok · nothing to lint (no ${from}); pass test files or folders`);
    if (o.json)
      process.stdout.write(JSON.stringify({ ok: true, files: [], tests: 0, findings: [] }, null, 2) + `
`);
    return 0;
  }
  for (const f of findings)
    o.log(`lint  ${f.level === "error" ? "ERROR" : "warn "} ${f.file}:${f.line} ${f.rule}: ${f.message}`);
  const errors2 = findings.filter((f) => f.level === "error").length;
  o.log(`LINT ${errors2 ? "failed" : "ok"} · ${linted.length} file(s), ${tests} test(s), ${errors2} error(s)${o.planFile ? ` · plan ${path14.relative(o.cwd, o.planFile)}` : ""}`);
  if (o.json)
    process.stdout.write(JSON.stringify({ ok: !errors2, files: linted, tests, findings }, null, 2) + `
`);
  return errors2 ? 1 : 0;
}

// src/skills.ts
import * as fs15 from "node:fs";
import * as path15 from "node:path";
import { fileURLToPath } from "node:url";
var MARKER = ".installed-by-witness";
function skillsDir() {
  const here = path15.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.WITNESS_SKILLS_DIR, path15.resolve(here, "..", "skills"), path15.resolve(here, "skills")].filter(Boolean);
  return candidates.find((d) => fs15.existsSync(path15.join(d, "test-change", "SKILL.md"))) ?? null;
}
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m)
    return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv)
      out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
function listSkills(dir) {
  return fs15.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs15.existsSync(path15.join(dir, e.name, "SKILL.md"))).map((e) => {
    const fm = frontmatter(fs15.readFileSync(path15.join(dir, e.name, "SKILL.md"), "utf8"));
    return { name: fm.name ?? e.name, description: fm.description ?? "", dir: path15.join(dir, e.name) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
function copyDir(src, dst) {
  fs15.mkdirSync(dst, { recursive: true });
  for (const e of fs15.readdirSync(src, { withFileTypes: true })) {
    const s = path15.join(src, e.name);
    const d = path15.join(dst, e.name);
    if (e.isDirectory())
      copyDir(s, d);
    else
      fs15.copyFileSync(s, d);
  }
}
function installSkills(src, dest, o) {
  fs15.mkdirSync(dest, { recursive: true });
  const skills = listSkills(src);
  for (const s of skills) {
    const target = path15.join(dest, `${o.prefix}${path15.basename(s.dir)}`);
    const st = fs15.lstatSync(target, { throwIfNoEntry: false });
    if (st && !st.isSymbolicLink() && !fs15.existsSync(path15.join(target, MARKER)))
      throw new Error(`${target} exists and was not installed by witness; move it away or pick another --prefix`);
  }
  const out = [];
  for (const s of skills) {
    const base = path15.basename(s.dir);
    const target = path15.join(dest, `${o.prefix}${base}`);
    fs15.rmSync(target, { recursive: true, force: true });
    if (o.link) {
      fs15.symlinkSync(s.dir, target, "dir");
      out.push({ name: s.name, path: target });
      continue;
    }
    copyDir(s.dir, target);
    const file = path15.join(target, "SKILL.md");
    const name = `${o.prefix}${s.name}`;
    fs15.writeFileSync(file, fs15.readFileSync(file, "utf8").replace(/^(---\r?\n[\s\S]*?^name:\s*).*$/m, `$1${name}`));
    fs15.writeFileSync(path15.join(target, MARKER), "");
    out.push({ name, path: target });
  }
  return out;
}
function skillsCommand(sub, o) {
  const src = skillsDir();
  if (!src) {
    o.log("skills  can't find the skills folder next to this witness; set WITNESS_SKILLS_DIR");
    return 2;
  }
  if (sub === "path") {
    process.stdout.write(o.json ? JSON.stringify({ path: src }) + `
` : `${src}
`);
    return 0;
  }
  if (sub === "list") {
    const list = listSkills(src);
    if (o.json)
      process.stdout.write(JSON.stringify(list, null, 2) + `
`);
    else
      for (const s of list)
        process.stdout.write(`${s.name.padEnd(12)} ${s.description}
`);
    return 0;
  }
  if (sub === "install") {
    if (!o.dir) {
      o.log("skills  install needs --dir <path>, e.g. --dir .claude/skills or --dir ~/.agents/skills");
      return 64;
    }
    const prefix = o.prefix ?? "witness-";
    const done = installSkills(src, path15.resolve(o.dir), { link: o.link, prefix });
    for (const d of done)
      o.log(`skills  ${o.link ? "linked" : "installed"} ${d.name} -> ${d.path}`);
    if (o.link && prefix)
      o.log(`skills  note: linked skills keep their own names (${done.map((d) => d.name).join(", ")})`);
    if (o.json)
      process.stdout.write(JSON.stringify({ installed: done }, null, 2) + `
`);
    return 0;
  }
  o.log("usage: witness skills path | list | install --dir <path> [--link] [--prefix witness-]");
  return 64;
}

// src/cli.ts
var HELP = `witness ${VERSION}: boot the app, run its own tests, and record results you can trust.

Usage:
  witness check  [--stage config|deps|boot|suite] [--service s] [--suite s] [--no-setup] [--against <git-ref>]
  witness run    [--suite s]... [--select id,...] [--retries n] [--no-setup] [--against <git-ref>] [--label name]
  witness up     [--service s] [--no-setup]        start services and leave them running (run reuses them)
  witness down                                    stop what \`witness up\` started
  witness status [run-id|latest]
  witness report [run-id|latest] [--format md|json]
  witness init                                    write .witness/witness.example.toml guessed from the repo
  witness plan check [file] [--draft] [--no-list] validate a test plan (default .witness/plan.yaml)
  witness lint [files...] [--plan file]           static checks on test files (default: changed test files)
  witness skills path | list                      where the agent skills are / what they are
  witness skills install --dir <path> [--link] [--prefix witness-]
                                                  copy (or link) the skills into an agent's skills folder

Common: --json (machine output on stdout) · --config <path> (default .witness/witness.toml)
        --run-dir-root <path> (default .witness/runs)
Exit codes: 0 passed · 1 failed · 2 error · 3 mistrial · 4 stalled/timeout · 5 interrupted · 64 usage`;
var VALUE_FLAGS = new Set(["config", "run-dir-root", "stage", "service", "suite", "select", "retries", "against", "label", "format", "plan", "dir", "prefix"]);
var BOOL_FLAGS = new Set(["json", "no-setup", "help", "version", "draft", "no-list", "link"]);
var REPEAT = new Set(["suite", "select"]);
function splitIds(v) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of v) {
    if (quote)
      quote = ch === quote ? "" : quote;
    else if (ch === '"' || ch === "'")
      quote = ch;
    else if ("([{".includes(ch))
      depth++;
    else if (")]}".includes(ch))
      depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  const prefixed = parts.some((x) => /^\s*[\w-]+:\S/.test(x));
  const out = [];
  for (const x of parts) {
    if (prefixed && out.length && !/^\s*[\w-]+:\S/.test(x))
      out[out.length - 1] += `,${x}`;
    else
      out.push(x);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}
function parseArgs(argv) {
  const flags = {};
  const lists = {};
  const pos = [];
  for (let i = 0;i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") {
      flags.help = true;
      continue;
    }
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (BOOL_FLAGS.has(k)) {
      flags[k] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(k))
      throw new UsageError(`unknown option --${k}`);
    const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (v === undefined)
      throw new UsageError(`--${k} needs a value`);
    if (REPEAT.has(k))
      (lists[k] ??= []).push(...k === "select" ? splitIds(v) : [v]);
    else
      flags[k] = v;
  }
  return { cmd: pos[0], pos: pos.slice(1), flags, lists };
}
function configPath(flags) {
  if (typeof flags.config === "string")
    return path16.resolve(flags.config);
  const found = findConfig(process.cwd());
  if (!found)
    throw new ConfigError("", "no .witness/witness.toml here or in a parent folder; run `witness init`");
  return found;
}
function runRoot(flags, root) {
  return typeof flags["run-dir-root"] === "string" ? path16.resolve(flags["run-dir-root"]) : path16.join(root, ".witness", "runs");
}
async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`witness  ${e.message}

${HELP}
`);
    return EXIT_USAGE2;
  }
  const { cmd, pos, flags, lists } = args;
  if (flags.version) {
    process.stdout.write(`${VERSION}
`);
    return 0;
  }
  if (!cmd || flags.help || cmd === "help") {
    process.stdout.write(HELP + `
`);
    return cmd || flags.help ? 0 : EXIT_USAGE2;
  }
  const json = !!flags.json;
  let cfg;
  const needsConfig = ["check", "run", "up", "down"].includes(cmd);
  try {
    if (cmd === "init")
      return initCommand(process.cwd(), json);
    if (cmd === "skills")
      return skillsCommand(pos[0], { dir: flags.dir, link: !!flags.link, prefix: flags.prefix, json, log: (s) => process.stderr.write(`witness  ${s}
`) });
    if (cmd === "lint") {
      const cp = typeof flags.config === "string" ? path16.resolve(flags.config) : findConfig(process.cwd());
      const lintCfg = cp ? loadConfig(cp) : undefined;
      const root = lintCfg?.root ?? process.cwd();
      const dflt = path16.join(root, ".witness", "plan.yaml");
      const planFile = typeof flags.plan === "string" ? path16.resolve(flags.plan) : fs16.existsSync(dflt) ? dflt : undefined;
      let plan;
      if (planFile) {
        const r = parsePlan(fs16.readFileSync(planFile, "utf8"), { draft: true });
        if (!r.plan)
          throw new UsageError(`${planFile} is not a valid plan; run \`witness plan check\``);
        plan = r.plan;
      }
      return lintCommand({ files: pos, cwd: process.cwd(), root, plan, planFile, suiteCwds: lintCfg?.suites.map((s) => s.cwd), json, log: (s) => process.stderr.write(`witness  ${s}
`) });
    }
    if (cmd === "plan") {
      if (pos[0] !== "check")
        throw new UsageError(`usage: witness plan check [file]`);
      const cp = typeof flags.config === "string" ? path16.resolve(flags.config) : findConfig(process.cwd());
      const planCfg = cp ? loadConfig(cp) : undefined;
      const file = path16.resolve(pos[1] ?? path16.join(planCfg?.root ?? process.cwd(), ".witness", "plan.yaml"));
      return await planCheckCommand(file, planCfg, { draft: !!flags.draft, list: !flags["no-list"], json, log: (s) => process.stderr.write(`witness  ${s}
`) });
    }
    if (cmd === "status" || cmd === "report") {
      const cp = typeof flags.config === "string" ? path16.resolve(flags.config) : findConfig(process.cwd());
      const root = cp ? rootFor(cp) : process.cwd();
      const rr2 = runRoot(flags, root);
      if (cmd === "status")
        return statusCommand(rr2, pos[0], json);
      const fmt = json ? "json" : String(flags.format ?? "md");
      if (fmt !== "md" && fmt !== "json")
        throw new UsageError(`--format must be md or json`);
      return reportCommand(rr2, pos[0], fmt);
    }
    if (!needsConfig)
      throw new UsageError(`unknown command "${cmd}"`);
    cfg = loadConfig(configPath(flags));
    ensureScratch(cfg.root);
    const rr = runRoot(flags, cfg.root);
    switch (cmd) {
      case "check": {
        const stage = flags.stage;
        if (stage && !["config", "deps", "boot", "suite"].includes(stage))
          throw new UsageError(`--stage must be config, deps, boot or suite`);
        if (typeof flags.service === "string" && !cfg.services.some((s) => s.name === flags.service))
          throw new UsageError(`unknown service "${flags.service}"`);
        return await checkCommand(cfg, { stage, service: flags.service, suites: lists.suite, json, noSetup: !!flags["no-setup"], against: flags.against });
      }
      case "run": {
        const retries = flags.retries === undefined ? 0 : Number(flags.retries);
        if (!Number.isInteger(retries) || retries < 0 || retries > 10)
          throw new UsageError("--retries must be a whole number from 0 to 10");
        return await runCommand(cfg, { suites: lists.suite, select: lists.select, retries, noSetup: !!flags["no-setup"], against: flags.against, label: flags.label, json, runDirRoot: rr });
      }
      case "up":
        if (typeof flags.service === "string" && !cfg.services.some((s) => s.name === flags.service))
          throw new UsageError(`unknown service "${flags.service}"`);
        return await upCommand(cfg, { service: flags.service, noSetup: !!flags["no-setup"], json, runDirRoot: rr });
      case "down":
        return await downCommand(cfg, { json });
    }
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`witness  ${e.message}
`);
      return EXIT_USAGE2;
    }
    if (e instanceof ConfigError) {
      const d = diagnose({ stage: "config", cause: "bad_config", evidence: e.message });
      process.stderr.write(`witness  VERDICT mistrial · the config can't be used
`);
      for (const l of formatDiagnosis(d))
        process.stderr.write(`witness    ${l}
`);
      if (json)
        process.stdout.write(JSON.stringify({ outcome: "mistrial", diagnosis: d }, null, 2) + `
`);
      return EXIT.mistrial;
    }
    throw e;
  }
  return EXIT_USAGE2;
}
var EXIT_USAGE2 = 64;
var self = process.argv[1] ? fs16.realpathSync(process.argv[1]) : "";
if (self.endsWith("cli.ts") || self.endsWith("witness.mjs")) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`witness  internal error: ${e.stack ?? e}
`);
    process.exit(EXIT.error);
  });
}
export {
  splitIds,
  parseArgs,
  main,
  EXIT_USAGE2 as EXIT_USAGE
};
