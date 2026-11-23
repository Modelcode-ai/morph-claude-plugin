#!/usr/bin/env node
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

// src/cli.ts
import * as fs11 from "node:fs";
import * as path12 from "node:path";

// src/commands.ts
import * as fs9 from "node:fs";
import * as path10 from "node:path";

// src/adapters.ts
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
  const parts = ids.map((id) => id.split(" > ").slice(1).join(sep).replace(/ \[[^\]]+\]$/, ""));
  return `(${parts.map(escapeRegExp).join("|")})$`;
}
function goSelect(cmd, ids) {
  const names = ids.map((id) => splitClassHash(id)[1]);
  const top = [...new Set(names.map((n) => n.split("/")[0]))];
  const subs = names.filter((n) => n.includes("/"));
  let run = `^(${top.map(escapeRegExp).join("|")})$`;
  if (subs.length && top.length === 1 && subs.length === names.length) {
    run += `/^(${subs.map((n) => escapeRegExp(n.split("/").slice(1).join("/"))).join("|")})$`;
  }
  return appendArgs(cmd, `-run ${shq(run)}`);
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
var ADAPTERS = {
  pytest: {
    name: "pytest",
    format: "junit",
    reportArgs: (d) => `--junitxml=${shq(path2.join(d, "junit.xml"))} -o junit_family=xunit1`,
    reportMarker: /--junit-?xml/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: pytestSelect,
    list: {
      cmd: (cmd) => appendArgs(cmd, "--collect-only -q"),
      parse: (out) => parseLines(out, /^(\S+\.py::\S.*)$/, (m) => m[1].trim())
    },
    perTestTimeout: (ms) => `--timeout=${Math.ceil(ms / 1000)}`,
    id: pytestId
  },
  "junit-maven": {
    name: "junit-maven",
    format: "junit",
    reportGlobs: [
      { base: "cwd", glob: "**/target/surefire-reports/TEST-*.xml" },
      { base: "cwd", glob: "**/target/failsafe-reports/TEST-*.xml" }
    ],
    select: (cmd, ids) => appendArgs(cmd, `${shq(`-Dtest=${ids.map((id) => {
      const [c, m] = splitClassHash(id);
      return `${c}#${stripParams(m)}`;
    }).join(",")}`)} -Dsurefire.failIfNoSpecifiedTests=false -DfailIfNoTests=false`),
    perTestTimeout: (ms) => shq(`-Djunit.jupiter.execution.timeout.default=${Math.ceil(ms / 1000)} s`),
    id: classHash
  },
  "junit-gradle": {
    name: "junit-gradle",
    format: "junit",
    reportGlobs: [{ base: "cwd", glob: "**/build/test-results/**/*.xml" }],
    select: (cmd, ids) => appendArgs(cmd, ids.map((id) => {
      const [c, m] = splitClassHash(id);
      return `--tests ${shq(`${c}.${stripParams(m)}`)}`;
    }).join(" ")),
    id: classHash
  },
  dotnet: {
    name: "dotnet",
    format: "trx",
    reportArgs: (d) => `--logger trx --results-directory ${shq(d)}`,
    reportMarker: /--logger[ =:]+["']?trx|--report-trx/,
    reportGlobs: [
      { base: "report-dir", glob: "**/*.trx" },
      { base: "cwd", glob: "**/TestResults/**/*.trx" }
    ],
    select: (cmd, ids) => appendArgs(cmd, `--filter ${shq(ids.map((id) => {
      const [c, m] = splitClassHash(id);
      return `FullyQualifiedName=${c}.${stripParams(m)}`;
    }).join("|"))}`),
    list: {
      cmd: (cmd) => appendArgs(cmd, "--list-tests"),
      parse: (out) => {
        const ids = [];
        let on = false;
        for (const line of out.split(/\r?\n/)) {
          if (/The following Tests are available/.test(line))
            on = true;
          else if (on && /^\s{2,}\S/.test(line))
            ids.push(dotnetFqnToId(line.trim()));
          else if (on && line.trim() && !/^\s/.test(line))
            on = false;
        }
        return [...new Set(ids)];
      }
    },
    perTestTimeout: (ms) => `--blame-hang-timeout ${Math.ceil(ms / 1000)}s`,
    id: classHash
  },
  jest: {
    name: "jest",
    format: "jest-json",
    reportArgs: (d) => `--json --outputFile=${shq(path2.join(d, "jest.json"))}`,
    reportMarker: /--json\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.json" }],
    select: (cmd, ids) => appendArgs(cmd, `-t ${shq(fullTitleRegex(ids, " "))}`),
    perTestTimeout: (ms) => `--testTimeout=${ms}`,
    id: titled
  },
  vitest: {
    name: "vitest",
    format: "junit",
    reportArgs: (d) => `--reporter=default --reporter=junit --outputFile.junit=${shq(path2.join(d, "junit.xml"))}`,
    reportMarker: /--reporter[= ]junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: (cmd, ids) => appendArgs(cmd, `-t ${shq(fullTitleRegex(ids, " "))}`),
    list: {
      cmd: (cmd) => /\bvitest\s+run\b/.test(cmd) ? cmd.replace(/\bvitest\s+run\b/, "vitest list") : /\bvitest\b/.test(cmd) ? cmd.replace(/\bvitest\b/, "vitest list") : null,
      parse: (out) => parseLines(out, /^(\S+\.[cm]?[jt]sx? > .+)$/, (m) => m[1].trim())
    },
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
    select: (cmd, ids) => {
      const files = [...new Set(ids.map((id) => id.split(" > ")[0]))];
      return appendArgs(cmd, `${files.map(shq).join(" ")} --grep ${shq(fullTitleRegex(ids, " "))}`);
    },
    list: { cmd: (cmd) => appendArgs(cmd, "--list"), parse: playwrightListParse },
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
    select: goSelect,
    list: {
      cmd: (cmd) => /\bgo\s+test\b/.test(cmd) ? cmd.replace(/\s-json\b/, "").replace(/\s-run\s+\S+/, "") + " -list ." : null,
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
    select: (cmd, ids) => appendArgs(cmd, `--grep ${shq(fullTitleRegex(ids, " "))}`),
    perTestTimeout: (ms) => `--timeout ${ms}`,
    id: titled
  },
  rspec: {
    name: "rspec",
    format: "junit",
    reportArgs: (d) => `--format progress --format RspecJunitFormatter --out ${shq(path2.join(d, "rspec.xml"))}`,
    reportMarker: /RspecJunitFormatter/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: (cmd, ids) => appendArgs(cmd, ids.map((id) => `-e ${shq(id.split(" > ").slice(1).join(" > "))}`).join(" ")),
    id: (c) => [normFile(c.file) ?? c.classname, clean(c.name)].filter(Boolean).join(" > ")
  },
  phpunit: {
    name: "phpunit",
    format: "junit",
    reportArgs: (d) => `--log-junit ${shq(path2.join(d, "phpunit.xml"))}`,
    reportMarker: /--log-junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: (cmd, ids) => {
      const pat = ids.map((id) => {
        const [c, m] = splitClassHash(id);
        return `${escapeRegExp(c)}::${escapeRegExp(stripParams(m).replace(/ with data set .*$/, ""))}`;
      });
      return appendArgs(cmd, `--filter ${shq(`/(${pat.join("|")})( with data set .*)?$/`)}`);
    },
    list: {
      cmd: (cmd) => appendArgs(cmd, "--list-tests"),
      parse: (out) => parseLines(out, /^\s*-\s+(\S+)::(\S+)/, (m) => `${m[1]}#${m[2]}`)
    },
    perTestTimeout: (ms) => `--default-time-limit=${Math.ceil(ms / 1000)}`,
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
      return template.replace("{ids}", ids.map(shq).join(" "));
    if (template.includes("{id}") && ids.length === 1)
      return template.replace("{id}", shq(ids[0]));
    return null;
  }
  return adapter.select ? adapter.select(cmd, ids) : null;
}

// src/config.ts
import * as fs2 from "node:fs";
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
  suite: ["name", "service", "adapter", "cwd", "cmd", "timeout", "per_test_timeout", "report", "select", "env"],
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
    if (fs2.existsSync(f))
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
  if (!fs2.existsSync(file))
    throw new ConfigError("", `config not found: ${file} (run \`witness init\`)`);
  let doc;
  try {
    doc = parse(fs2.readFileSync(file, "utf8"));
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
    return {
      name,
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
    if (fs2.existsSync(f)) {
      Object.assign(env, parseEnvFile(fs2.readFileSync(f, "utf8")));
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
var lastMeaningful = (lines) => [...lines].reverse().find((l) => !/^\s*\$ /.test(l) && l.trim().length > 1)?.trim();
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
  evidence ??= lastMeaningful(lines)?.slice(0, 500);
  const d = {
    stage: inp.stage,
    cause,
    retryable: RETRYABLE.has(cause),
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
      t.push(`set per_test_timeout for suite ${inp.suite ?? ""} so a hung test fails instead of hanging`);
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

// src/proc.ts
import { spawn } from "node:child_process";
import * as fs3 from "node:fs";
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
  fs3.mkdirSync(path4.dirname(opts.log), { recursive: true });
  const fd = fs3.openSync(opts.log, "a");
  fs3.writeSync(fd, `$ ${cmd}
`);
  const child = spawn("bash", ["-c", cmd], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", fd, fd], detached: true });
  fs3.closeSync(fd);
  const p = {
    name: opts.name,
    pid: child.pid ?? -1,
    pgid: child.pid ?? -1,
    child,
    log: opts.log,
    exited: false,
    code: null,
    exit: new Promise((resolve2) => {
      child.on("error", (e) => {
        fs3.appendFileSync(opts.log, `witness: failed to start: ${e.message}
`);
        p.exited = true;
        p.code = 127;
        resolve2({ code: 127, signal: null });
      });
      child.on("exit", (code, signal) => {
        p.exited = true;
        p.code = code ?? (signal ? 128 : 1);
        resolve2({ code: p.code, signal });
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
  const chunks = [];
  child.stdout?.on("data", (d) => chunks.push(d));
  child.stderr?.on("data", (d) => chunks.push(d));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid)
      killGroup(child.pid, 2000);
  }, opts.timeoutMs);
  const code = await new Promise((resolve2) => {
    child.on("error", () => resolve2(127));
    child.on("close", (c2) => resolve2(c2));
  });
  clearTimeout(timer);
  const out = Buffer.concat(chunks).toString("utf8");
  if (opts.log) {
    fs3.mkdirSync(path4.dirname(opts.log), { recursive: true });
    fs3.appendFileSync(opts.log, `$ ${cmd}
${out}${out.endsWith(`
`) || !out ? "" : `
`}`);
  }
  return { code: timedOut ? null : code, out, timedOut };
}
async function httpProbe(url, status, timeoutMs = 3000) {
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
function portFree(port) {
  return new Promise((resolve2) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve2(false));
    srv.listen({ port, host: "0.0.0.0", exclusive: true }, () => {
      srv.close(() => {
        const s2 = net.createServer();
        s2.unref();
        s2.once("error", () => resolve2(false));
        s2.listen({ port, host: "127.0.0.1", exclusive: true }, () => s2.close(() => resolve2(true)));
      });
    });
  });
}
function anyFreePort() {
  return new Promise((resolve2, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve2(port));
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
var cleanId = (adapter, id) => id.startsWith(`${adapter.name}:`) ? id.slice(adapter.name.length + 1) : id;
function toRecord(c2, adapter, suite, cwd, obtained = "report") {
  const file = normFile(c2.file, cwd);
  const raw = { ...c2, file };
  const local = adapter.id(raw);
  const r = { id: stableId(adapter.name, local), name: local, suite, adapter: adapter.name, status: c2.status, durationMs: c2.durationMs, obtained };
  if (c2.statusDetail)
    r.statusDetail = c2.statusDetail;
  if (c2.message)
    r.message = c2.message;
  if (c2.trace)
    r.trace = c2.trace;
  if (file)
    r.filePath = file;
  if (c2.retries)
    r.retries = c2.retries;
  if (c2.flaky)
    r.flaky = true;
  if (c2.attachments?.length)
    r.attachments = c2.attachments.map((a) => ({ ...a, path: path5.isAbsolute(a.path) ? a.path : path5.join(cwd, a.path) }));
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
    else if (t.status === "failed" && t.statusDetail !== "error")
      s.failed++;
    else if (t.statusDetail === "missing")
      s.missing++;
    else
      s.error++;
  }
  return s;
}
function suiteLevel(adapter, suite, exitCode, message) {
  const ok = exitCode === 0;
  const r = { id: stableId(adapter.name, `(suite ${suite})`), name: suite, suite, adapter: adapter.name, status: ok ? "passed" : "failed", durationMs: 0, obtained: "suite-level", message };
  if (!ok)
    r.statusDetail = "error";
  return r;
}
function reconcile(inp) {
  const { adapter, suite, exitCode, end, cwd } = inp;
  const unreadable = inp.files.filter((f) => f.error);
  let tests = dedupe(inp.files.flatMap((f) => f.cases.map((c2) => toRecord(c2, adapter, suite, cwd))));
  const expected = (inp.expected ?? []).map((id) => stableId(adapter.name, cleanId(adapter, id)));
  if (end === "interrupted" || end === "service_died" || end === "timeout" || end === "stalled") {
    const have = new Set(tests.map((t) => t.id));
    for (const id of expected)
      if (!have.has(id))
        tests.push(missing(id, adapter, suite, end === "timeout" || end === "stalled" ? "timeout" : "missing"));
    const state = end === "interrupted" ? "interrupted" : end === "service_died" ? "error" : end === "timeout" ? "timeout" : "stalled";
    const cause2 = end === "service_died" ? "service_died" : end === "timeout" ? "suite_timeout" : end === "stalled" ? "stalled" : undefined;
    if (!tests.length && end !== "interrupted")
      tests = [{ ...suiteLevel(adapter, suite, 1, `suite ${end === "service_died" ? "aborted: a service died" : end}`), statusDetail: end === "service_died" ? "error" : "timeout" }];
    return { tests, state, cause: cause2 };
  }
  if (tests.length) {
    const have = new Set(tests.map((t) => t.id));
    const absent = expected.filter((id) => !have.has(id));
    for (const id of absent)
      tests.push(missing(id, adapter, suite, "missing"));
    const failed = tests.some((t) => t.status === "failed");
    if (failed)
      return { tests, state: "failed", note: unreadable.length ? `${unreadable.length} report file(s) unreadable` : undefined };
    if (exitCode !== 0)
      return { tests, state: "error", cause: "report_incomplete", note: `exit code ${exitCode} but the report shows no failures` };
    if (absent.length)
      return { tests, state: "error", cause: "report_incomplete", note: `${absent.length} expected test(s) missing from the report` };
    if (unreadable.length)
      return { tests, state: "error", cause: "report_unreadable", note: `${unreadable.length} report file(s) unreadable: ${unreadable[0].error}` };
    return { tests, state: "passed" };
  }
  if (inp.exitCodeOnly) {
    return { tests: [suiteLevel(adapter, suite, exitCode, `exit code ${exitCode}`)], state: exitCode === 0 ? "passed" : "failed" };
  }
  const cause = unreadable.length ? "report_unreadable" : "report_missing";
  const note = unreadable.length ? `report unreadable: ${unreadable[0].error}` : inp.files.length ? "report lists no tests" : "no report written";
  if (expected.length)
    return { tests: [], state: "error", cause, note, rerun: expected.map((id) => cleanId(adapter, id.slice(adapter.name.length + 1))) };
  return { tests: [suiteLevel(adapter, suite, exitCode, `${note}; exit code ${exitCode}`)], state: "error", cause, note };
}
function missing(id, adapter, suite, detail) {
  return { id, name: id.slice(adapter.name.length + 1), suite, adapter: adapter.name, status: "other", statusDetail: detail, durationMs: 0, obtained: "report", message: detail === "timeout" ? "did not finish before the suite was stopped" : "expected but absent from the report" };
}
function fromReruns(results, adapter, suite, cwd, originalExit, cause) {
  const tests = [];
  for (const r of results) {
    const sid = stableId(adapter.name, r.id);
    const cases = r.files.flatMap((f) => f.cases.map((c2) => toRecord(c2, adapter, suite, cwd, "per-test-rerun")));
    const hit = cases.find((c2) => c2.id === sid) ?? (cases.length === 1 ? { ...cases[0], id: sid } : undefined);
    if (hit)
      tests.push(hit);
    else {
      const t = { id: sid, name: r.id, suite, adapter: adapter.name, status: r.exitCode === 0 ? "passed" : "failed", durationMs: 0, obtained: "per-test-rerun", message: r.timedOut ? "timed out when run alone" : `run alone: exit code ${r.exitCode}` };
      if (r.timedOut)
        t.statusDetail = "timeout";
      tests.push(t);
    }
  }
  const failed = tests.some((t) => t.status === "failed");
  if (failed)
    return { tests, state: "failed", cause, note: "suite report unusable; tests rerun one by one" };
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
    counts.origin_only++;
    out.push({ id: ot.id, name: ot.name, suite: ot.suite, adapter: ot.adapter, status: "other", statusDetail: "missing", durationMs: 0, obtained: ot.obtained, filePath: ot.filePath, parity: "origin_only", originStatus: ot.status, message: "present on the origin, absent on the target" });
  }
  return { tests: out, counts };
}

// src/rundir.ts
import * as fs4 from "node:fs";
import * as path6 from "node:path";
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
    this.dir = path6.join(root, runId);
    fs4.mkdirSync(path6.join(this.dir, "logs"), { recursive: true });
    fs4.mkdirSync(path6.join(this.dir, "reports"), { recursive: true });
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
    return path6.join(this.dir, ...p);
  }
  saveStatus() {
    writeJson(this.file("status.json"), this.status);
  }
  saveState() {
    writeJson(this.file("state.json"), this.state);
  }
  event(type, data = {}, lastEvent) {
    fs4.appendFileSync(this.file("events.jsonl"), JSON.stringify({ t: new Date().toISOString(), type, ...data }) + `
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
  linkLatest() {
    const link = path6.join(this.root, "latest");
    try {
      fs4.rmSync(link, { force: true });
      fs4.symlinkSync(this.status.run_id, link);
    } catch {
      fs4.writeFileSync(link, this.status.run_id);
    }
  }
}
function resolveRun(root, id) {
  const which = !id || id === "latest" ? "latest" : id;
  const p = path6.join(root, which);
  try {
    const st = fs4.lstatSync(p);
    if (st.isSymbolicLink())
      return path6.join(root, fs4.readlinkSync(p));
    if (st.isFile())
      return path6.join(root, fs4.readFileSync(p, "utf8").trim());
    if (st.isDirectory())
      return p;
  } catch {
    if (which === "latest") {
      const runs = listRuns(root);
      return runs.length ? path6.join(root, runs[runs.length - 1]) : null;
    }
  }
  return null;
}
function listRuns(root) {
  try {
    return fs4.readdirSync(root).filter((d) => /^r-\d{8}-\d{6}-[0-9a-f]{4}$/.test(d) && fs4.existsSync(path6.join(root, d, "status.json"))).sort();
  } catch {
    return [];
  }
}
async function reapStale(root, graceMs, log) {
  const reaped = [];
  for (const id of listRuns(root)) {
    const dir = path6.join(root, id);
    const status = readJson(path6.join(dir, "status.json"), null);
    const state = readJson(path6.join(dir, "state.json"), null);
    if (!status || status.phase === "finished" || !state || state.pid === process.pid || pidAlive(state.pid))
      continue;
    const fresh = Date.now() - Date.parse(state.started_at) < 24 * 3600000;
    let killed = 0;
    if (fresh) {
      for (const p of state.procs) {
        if (groupAlive(p.pgid)) {
          await killGroup(p.pgid, graceMs);
          killed++;
        }
      }
    }
    status.phase = "finished";
    status.outcome = "interrupted";
    status.finished_at = new Date().toISOString();
    status.last_event = `reaped: witness (pid ${state.pid}) exited without finishing${killed ? `; killed ${killed} leftover process group(s)` : ""}`;
    writeJson(path6.join(dir, "status.json"), status);
    fs4.appendFileSync(path6.join(dir, "events.jsonl"), JSON.stringify({ t: new Date().toISOString(), type: "reaped", by: process.pid, killed }) + `
`);
    state.procs = [];
    writeJson(path6.join(dir, "state.json"), state);
    log(`reaped stale run ${id}${killed ? ` (killed ${killed} leftover process group(s))` : ""}`);
    reaped.push(id);
  }
  return reaped;
}
function pruneRuns(root, keep) {
  const runs = listRuns(root);
  for (const id of runs.slice(0, Math.max(0, runs.length - keep))) {
    const st = readJson(path6.join(root, id, "status.json"), null);
    if (st && st.phase !== "finished")
      continue;
    fs4.rmSync(path6.join(root, id), { recursive: true, force: true });
  }
}

class LockError extends Error {
}
function acquireLock(file) {
  fs4.mkdirSync(path6.dirname(file), { recursive: true });
  for (let attempt = 0;attempt < 2; attempt++) {
    try {
      const fd = fs4.openSync(file, "wx");
      fs4.writeSync(fd, String(process.pid));
      fs4.closeSync(fd);
      return () => {
        try {
          if (fs4.readFileSync(file, "utf8").trim() === String(process.pid))
            fs4.rmSync(file, { force: true });
        } catch {}
      };
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      const pid = Number(fs4.readFileSync(file, "utf8").trim());
      if (pidAlive(pid) && pid !== process.pid)
        throw new LockError(`another witness run (pid ${pid}) is using this checkout; wait for it or stop it (lock: ${file})`);
      fs4.rmSync(file, { force: true });
    }
  }
  throw new LockError(`could not take the lock ${file}`);
}

// src/run.ts
import * as fs8 from "node:fs";
import * as os from "node:os";
import * as path9 from "node:path";

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
import * as fs5 from "node:fs";
import * as path7 from "node:path";
class Failure extends Error {
  diagnosis;
  constructor(d) {
    super(`${d.cause}${d.evidence ? `: ${d.evidence}` : ""}`);
    this.diagnosis = d;
  }
}
var SETUP_TIMEOUT = 30 * 60000;
var upFile = (root) => path7.join(root, ".witness", "up.json");
function readUp(root) {
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
      const log = path7.join(this.o.logDir, `dep-${d.name}.log`);
      if (d.start && !this.o.reuse?.deps_started.includes(d.name)) {
        this.o.progress.line(`deps   ${d.name} · not reachable (${r.detail}); starting it`);
        const s = await runCapture(substitute(d.start, this.vars()), { cwd: this.o.root, env: childEnv(this.o.baseEnv), timeoutMs: d.timeoutMs, log });
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
        this.fail("deps", "dependency_unreachable", { command: d.check ?? `curl ${d.checkHttp}`, evidence: `${d.name}: ${r.detail}`, log: fs5.existsSync(log) ? log : undefined });
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
    const cwd = path7.resolve(this.o.root, svc.cwd);
    const log = path7.join(this.o.logDir, `${svc.name}.log`);
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
    const cmd = substitute(svc.start, vars);
    const proc = spawnGroup(cmd, { name: svc.name, cwd, env, log });
    ls.proc = proc;
    ls.pgid = proc.pgid;
    this.live.set(alias, ls);
    this.o.run?.track({ kind: "service", name: svc.name, pid: proc.pid, pgid: proc.pgid, pidfile: svc.pidfile ? path7.resolve(cwd, substitute(svc.pidfile, vars)) : undefined, stop: svc.stop, cwd });
    this.o.run?.event("service_started", { service: svc.name, pid: proc.pid, port: alloc.port, cmd }, `starting ${svc.name}`);
    this.o.progress.line(`boot   ${svc.name} · starting on port ${alloc.port}`);
    try {
      await this.waitReady(ls, cwd, false, cmd);
    } catch (e) {
      this.live.delete(alias);
      await this.stopOne(ls);
      throw e;
    }
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
    const cacheFile = this.o.setupCacheDir ? path7.join(this.o.setupCacheDir, `${svc.name}.json`) : null;
    if (hash && cacheFile && readJson(cacheFile, {}).hash === hash) {
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
    if (hash && cacheFile)
      writeJson(cacheFile, { hash, at: new Date().toISOString() });
    this.o.progress.line(`setup  ${svc.name} · done (${fmtDuration(Date.now() - t0)})`);
  }
  async waitReady(ls, cwd, external, cmd) {
    const svc = ls.svc;
    const timeoutMs = svc.ready?.timeoutMs ?? 120000;
    const until = Date.now() + timeoutMs;
    const pidfile = svc.pidfile ? path7.resolve(cwd, substitute(svc.pidfile, this.vars(ls))) : undefined;
    let delay = 200;
    let last = "";
    const exitedFail = () => this.fail("boot", "exited_before_ready", { service: svc.name, command: cmd, log: ls.log, cwd: svc.cwd, port: ls.port, evidence: undefined });
    for (;; ) {
      if (this.o.abort.aborted)
        return;
      if (pidfile && !ls.pid && fs5.existsSync(pidfile)) {
        const pid = Number(fs5.readFileSync(pidfile, "utf8").trim());
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
      if (!svc.ready) {
        await sleep(1000);
        if (!external && !pidfile && ls.proc?.exited)
          exitedFail();
        return;
      }
      const r = await this.probe(ls);
      if (r.ok)
        return;
      last = r.detail;
      if (Date.now() > until) {
        const url = svc.ready.http ? substitute(svc.ready.http, this.vars(ls)) : undefined;
        this.fail("boot", "ready_timeout", { service: svc.name, command: svc.ready.cmd ?? cmd, log: external ? undefined : ls.log, url, port: ls.port, evidence: `not ready after ${fmtDuration(timeoutMs)}: ${last}`, cwd: svc.cwd });
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 1000);
    }
  }
  async probe(ls) {
    const r = ls.svc.ready;
    if (!r)
      return { ok: true, detail: "no readiness check" };
    const vars = this.vars(ls);
    if (r.http)
      return httpProbe(substitute(r.http, vars), r.status);
    const res = await runCapture(substitute(r.cmd, vars), { cwd: path7.resolve(this.o.root, ls.svc.cwd), env: childEnv(this.o.baseEnv, { PORT: String(ls.port ?? ""), ...this.serviceUrlEnv() }), timeoutMs: 1e4 });
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
      if (!dead && ls.svc.ready && now - ls.lastProbe >= 5000) {
        ls.lastProbe = now;
        const r = await this.probe(ls);
        ls.probeFailures = r.ok ? 0 : ls.probeFailures + 1;
        if (ls.probeFailures >= 3)
          dead = `readiness check failed 3 times in a row (${r.detail})`;
      }
      if (dead) {
        const d = diagnose({ stage: "suite", cause: "service_died", service: ls.svc.name, log: fs5.existsSync(ls.log) ? ls.log : undefined, cwd: ls.svc.cwd });
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
      const cwd = path7.resolve(this.o.root, ls.svc.cwd);
      await runCapture(substitute(ls.svc.stop, this.vars(ls)), { cwd, env: childEnv(this.o.baseEnv, { PORT: String(ls.port ?? "") }), timeoutMs: 60000, log: ls.log });
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
      await runCapture(substitute(d.stop, this.vars()), { cwd: this.o.root, env: childEnv(this.o.baseEnv), timeoutMs: 120000, log: path7.join(this.o.logDir, `dep-${d.name}.log`) });
    }
    this.depsStarted = [];
  }
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
      const p = path7.join(cwd, f);
      const st = fs5.statSync(p);
      return st.size < 1024 * 1024 ? `${f}:${sha(fs5.readFileSync(p))}` : `${f}:${st.size}`;
    } catch {
      return f;
    }
  }).join(`
`);
  return sha([cmd, head.out, diff.out, stamps].join("\x00"));
}

// src/suite.ts
import * as fs7 from "node:fs";
import * as path8 from "node:path";

// src/parsers/index.ts
import * as fs6 from "node:fs";

// src/parsers/types.ts
class ReportError extends Error {
}

// src/parsers/gotest.ts
function parseGoJson(text) {
  const tests = new Map;
  const pkgOut = new Map;
  const pkgEnd = new Map;
  let events = 0;
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l.startsWith("{"))
      continue;
    let e;
    try {
      e = JSON.parse(l);
    } catch {
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
    const { out: lines, done, ...c2 } = t;
    if (!done) {
      c2.status = "failed";
      c2.statusDetail = /panic: test timed out/.test((pkgOut.get(c2.classname) ?? []).join("")) ? "timeout" : "error";
      c2.message = "test started but never finished (binary crashed, timed out or was killed)";
    }
    if (c2.status === "failed") {
      const body = lines.filter((x) => !/^(=== |--- |\s*$)/.test(x)).join("");
      c2.message = c2.message ?? (body.trim().split(`
`)[0]?.trim().slice(0, 2000) || undefined);
      if (body.trim())
        c2.trace = body.slice(0, 20000);
    }
    out.push(c2);
  }
  for (const [pkg, end] of pkgEnd) {
    const has = out.some((c2) => c2.classname === pkg);
    if (end === "fail" && !out.some((c2) => c2.classname === pkg && c2.status === "failed")) {
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
        message: fail ? fail.trim().split(`
`)[0].slice(0, 2000) : undefined,
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
  const c2 = {
    name: attr(tc, "name") ?? "(unnamed)",
    classname: attr(tc, "class") ?? attr(tc, "classname") ?? attr(suite, "name"),
    file: attr(tc, "file") ?? attr(suite, "file"),
    line: attr(tc, "line") ? Number(attr(tc, "line")) : undefined,
    status: "passed",
    durationMs: secToMs(attr(tc, "time"))
  };
  const bad = failures[0] ?? errors[0];
  if (bad !== undefined) {
    c2.status = "failed";
    if (failures.length === 0)
      c2.statusDetail = "error";
    c2.message = (attr(bad, "message") ?? textOf(bad).trim().split(`
`)[0] ?? "").slice(0, 2000) || undefined;
    const trace = textOf(bad).trim();
    if (trace)
      c2.trace = trace.slice(0, 20000);
    if (/Timeout/.test(attr(bad, "type") ?? "") || /timed out|timeout of \d+|timeout \d+ ?ms exceeded/i.test(c2.message ?? ""))
      c2.statusDetail = "timeout";
    if (reruns.length)
      c2.retries = reruns.length;
  } else if (skipped.length) {
    c2.status = "skipped";
    c2.message = attr(skipped[0], "message") ?? (textOf(skipped[0]).trim() || undefined);
  } else if (flaky.length) {
    c2.flaky = true;
    c2.retries = flaky.length;
    c2.message = attr(flaky[0], "message");
  }
  const atts = attachmentsFrom(out);
  if (atts.length)
    c2.attachments = atts;
  return c2;
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
        const c2 = {
          name: spec.title ?? "(unnamed)",
          file: spec.file ?? f,
          titles: [...here, spec.title ?? "(unnamed)"],
          line: spec.line,
          status: "other",
          durationMs: results.reduce((a, r) => a + (r.duration ?? 0), 0),
          _project: t.projectName ?? ""
        };
        if (st === "skipped" || t.expectedStatus === "skipped" || last?.status === "skipped")
          c2.status = "skipped";
        else if (st === "expected")
          c2.status = "passed";
        else if (st === "flaky") {
          c2.status = "passed";
          c2.flaky = true;
        } else if (st === "unexpected") {
          c2.status = "failed";
          if (last?.status === "timedOut")
            c2.statusDetail = "timeout";
          else if (last?.status === "interrupted")
            c2.statusDetail = "error";
        } else if (last?.status === "passed")
          c2.status = "passed";
        else if (last?.status === "failed" || last?.status === "timedOut")
          c2.status = "failed";
        if (results.length > 1)
          c2.retries = results.length - 1;
        const err = [...results].reverse().find((r) => r.error || r.errors?.length);
        const e = err?.error ?? err?.errors?.[0];
        if (e && c2.status !== "passed") {
          c2.message = stripAnsi2(e.message ?? "").split(`
`)[0].slice(0, 2000) || undefined;
          if (e.stack || e.message)
            c2.trace = stripAnsi2(e.stack ?? e.message ?? "").slice(0, 20000);
        }
        const atts = [];
        for (const r of results)
          for (const a of r.attachments ?? [])
            if (a.path)
              atts.push({ name: a.name ?? "", path: a.path, contentType: a.contentType ?? "" });
        if (atts.length)
          c2.attachments = atts;
        rows.push(c2);
      }
    }
    for (const sub of s.suites ?? [])
      walk(sub, here, f);
  };
  for (const s of doc.suites)
    walk(s, [], undefined);
  const multi = new Set(rows.map((r) => r._project)).size > 1;
  return rows.map(({ _project, ...c2 }) => multi && _project ? { ...c2, project: _project } : c2);
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
  if (hint === "go-json")
    return { format: "go-json", cases: parseGoJson(body) };
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
    const { format, cases } = parseReportText(fs6.readFileSync(file, "utf8"), hint, cwd);
    return { file, format, cases };
  } catch (e) {
    return { file, cases: [], error: e instanceof ReportError ? e.message : `unreadable: ${e.message}` };
  }
}

// src/suite.ts
var MAX_RERUNS = 200;
var safeId = (id) => id.replace(/[^\w.@-]+/g, "_").slice(0, 180);
function dirSize(dir) {
  let n = 0;
  const walk = (d) => {
    let es;
    try {
      es = fs7.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path8.join(d, e.name);
      if (e.isDirectory())
        walk(p);
      else
        n += fileSize(p) + 1;
    }
  };
  walk(dir);
  return n;
}
function suiteCommand(suite, adapter, vars, reportDir, select) {
  let cmd = substitute(suite.cmd, vars);
  if (select?.length) {
    const sel = selectCommand(adapter, cmd, select, suite.select ? substitute(suite.select, vars) : undefined);
    if (!sel)
      throw new Error(`suite ${suite.name}: adapter ${adapter.name} cannot select single tests; add select = "... {ids}" to the suite`);
    cmd = sel;
  }
  if (adapter.reportArgs && !suite.report && !(adapter.reportMarker && adapter.reportMarker.test(cmd)))
    cmd = appendArgs(cmd, adapter.reportArgs(reportDir));
  if (suite.perTestTimeoutMs && adapter.perTestTimeout)
    cmd = appendArgs(cmd, adapter.perTestTimeout(suite.perTestTimeoutMs));
  return cmd;
}
async function runSuite(ctx, suite, select, retries) {
  const adapter = ADAPTERS[suite.adapter];
  const cwd = path8.resolve(ctx.root, suite.cwd);
  const p = ctx.prefix ?? "";
  const reportDir = path8.join(ctx.outDir, "reports", suite.name);
  const log = path8.join(ctx.outDir, "logs", `${suite.name}.log`);
  fs7.rmSync(reportDir, { recursive: true, force: true });
  fs7.mkdirSync(reportDir, { recursive: true });
  const t0 = Date.now();
  const vars = { ...ctx.stack.vars(), WITNESS_REPORT_DIR: reportDir };
  const cmd = suiteCommand(suite, adapter, vars, reportDir, select);
  ctx.progress.line(`${p}suite  ${suite.name} · ${cmd}`);
  ctx.run.event("suite_started", { suite: suite.name, cmd, origin: !!p }, `${p}suite ${suite.name} running`);
  const exec = await execWatched(ctx, suite, adapter, cmd, cwd, reportDir, log, suite.timeoutMs);
  const files = collect(ctx, suite, adapter, cwd, reportDir, log, t0);
  let expected = select;
  const usable = files.some((f) => f.cases.length);
  if (!expected && !usable && exec.end === "exit" && adapter.list && !(suite.adapter === "generic" && !suite.report)) {
    expected = await listTests(ctx, suite, adapter, cwd, log);
  }
  const exitCodeOnly = suite.adapter === "generic" && !suite.report && files.length === 0;
  let res = reconcile({ suite: suite.name, adapter, exitCode: exec.code, end: exec.end, files, expected, cwd, exitCodeOnly });
  if (res.rerun?.length && !ctx.abort.aborted) {
    if (res.rerun.length <= MAX_RERUNS && (adapter.select || suite.select)) {
      ctx.progress.line(`${p}suite  ${suite.name} · ${res.cause === "report_unreadable" ? "report unreadable" : "no report"}; rerunning ${res.rerun.length} test(s) one at a time`);
      const results = [];
      for (const [i, id] of res.rerun.entries()) {
        if (ctx.abort.aborted)
          break;
        const dir = path8.join(reportDir, "rerun", String(i + 1));
        fs7.mkdirSync(dir, { recursive: true });
        const c2 = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, [id]);
        const e = await execWatched(ctx, suite, adapter, c2, cwd, dir, path8.join(ctx.outDir, "logs", `${suite.name}.rerun.log`), suite.perTestTimeoutMs ?? Math.min(suite.timeoutMs, 10 * 60000));
        if (e.died) {
          exec.died = e.died;
          break;
        }
        results.push({ id, exitCode: e.code, files: collect(ctx, suite, adapter, cwd, dir, path8.join(ctx.outDir, "logs", `${suite.name}.rerun.log`), Date.now() - e.ms), timedOut: e.end !== "exit" });
      }
      res = fromReruns(results, adapter, suite.name, cwd, exec.code, res.cause);
    } else {
      res = { ...res, tests: [suiteLevel(adapter, suite.name, exec.code, `${res.note}; exit code ${exec.code}`)] };
    }
  }
  if (retries > 0 && res.state === "failed" && exec.end === "exit" && !exec.died && (adapter.select || suite.select)) {
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
    diagnosis = diagnose({ stage: res.cause.startsWith("report") ? "report" : "suite", cause: res.cause, suite: suite.name, command: cmd, log, cwd: suite.cwd, evidence: res.cause === "report_unreadable" ? files.find((f) => f.error)?.error : res.cause === "report_incomplete" ? res.note : undefined });
  }
  ctx.run.event("suite_finished", { suite: suite.name, state: summary.state, exit_code: exec.code, end: exec.end, cause: res.cause, passed: summary.passed, failed: summary.failed, ms: Date.now() - t0 }, `${p}suite ${suite.name} ${summary.state}`);
  const counts = [`${summary.passed} passed`, `${summary.failed} failed`, summary.error && `${summary.error} error`, summary.missing && `${summary.missing} missing`, summary.skipped && `${summary.skipped} skipped`].filter(Boolean).join(", ");
  ctx.progress.line(`${p}suite  ${suite.name} · ${summary.state} · ${counts} · exit ${exec.code ?? "-"} (${fmtDuration(Date.now() - t0)})${res.note ? ` · ${res.note}` : ""}`);
  return { summary, tests: res.tests, diagnosis, serviceDied: exec.died };
}
async function execWatched(ctx, suite, adapter, cmd, cwd, reportDir, log, timeoutMs) {
  const artifacts = path8.join(ctx.outDir, "artifacts");
  fs7.mkdirSync(artifacts, { recursive: true });
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
      fs7.appendFileSync(log, `
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
function collect(ctx, suite, adapter, cwd, reportDir, log, startedAt) {
  const files = [];
  if (adapter.fromStdout && !suite.report) {
    const out = path8.join(reportDir, "stdout.jsonl");
    try {
      fs7.copyFileSync(log, out);
      files.push(out);
    } catch {}
  }
  const globs = suite.report ? [{ base: "cwd", glob: substitute(suite.report, { ...ctx.stack.vars(), WITNESS_REPORT_DIR: reportDir }) }] : adapter.reportGlobs;
  for (const g of globs) {
    if (g.base === "report-dir") {
      for (const f of globFiles(reportDir, [g.glob], { skipDirs: new Set(["rerun", "retry"]) }))
        files.push(path8.join(reportDir, f));
      continue;
    }
    let base = cwd;
    let glob = g.glob;
    if (path8.isAbsolute(glob)) {
      const fixed = glob.split("/").findIndex((s) => /[*?{]/.test(s));
      const parts = glob.split("/");
      base = fixed < 0 ? path8.dirname(glob) : parts.slice(0, fixed).join("/") || "/";
      glob = fixed < 0 ? path8.basename(glob) : parts.slice(fixed).join("/");
    }
    for (const rel of globFiles(base, [glob], { skipDirs: new Set([".git", "node_modules", ".witness"]) })) {
      const src = path8.join(base, rel);
      if (src.startsWith(reportDir + path8.sep)) {
        files.push(src);
        continue;
      }
      try {
        if (fs7.statSync(src).mtimeMs < startedAt - 2000)
          continue;
      } catch {
        continue;
      }
      const dst = path8.join(reportDir, rel.replace(/[\\/]/g, "__"));
      fs7.copyFileSync(src, dst);
      files.push(dst);
    }
  }
  const uniq = [...new Set(files)];
  return uniq.map((f) => parseReportFile(f, adapter.format, cwd));
}
async function listTests(ctx, suite, adapter, cwd, log) {
  const base = substitute(suite.cmd, ctx.stack.vars());
  const cmd = adapter.list.cmd(base);
  if (!cmd)
    return;
  ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · listing tests to see what the run left out`);
  const r = await runCapture(cmd, { cwd, env: childEnv(ctx.baseEnv, ctx.stack.serviceUrlEnv()), timeoutMs: 5 * 60000, log: log.replace(/\.log$/, ".list.log") });
  if (r.code !== 0)
    return;
  const ids = adapter.list.parse(r.out);
  return ids.length ? ids : undefined;
}
async function retryFailed(ctx, suite, adapter, cwd, vars, reportDir, tests, retries) {
  for (let k = 1;k <= retries; k++) {
    const failing = tests.filter((t) => t.status === "failed" && t.obtained !== "suite-level");
    if (!failing.length || ctx.abort.aborted)
      return;
    const ids = failing.map((t) => t.id.slice(adapter.name.length + 1));
    const dir = path8.join(reportDir, "retry", String(k));
    fs7.mkdirSync(dir, { recursive: true });
    const cmd = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, ids);
    ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · retry ${k}/${retries} of ${ids.length} failed test(s)`);
    const rlog = path8.join(ctx.outDir, "logs", `${suite.name}.retry.log`);
    const t0 = Date.now();
    const e = await execWatched(ctx, suite, adapter, cmd, cwd, dir, rlog, suite.timeoutMs);
    if (e.end !== "exit")
      return;
    const again = collect(ctx, suite, adapter, cwd, dir, rlog, t0).flatMap((f) => f.cases.map((c2) => toRecord(c2, adapter, suite.name, cwd)));
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
  if (/trace/i.test(path8.basename(file)) || ct === "application/zip")
    return "trace";
  if (ct === "text/plain")
    return "log";
  return "report";
}
function collectArtifacts(runDir, outDir, tests) {
  const out = [];
  const artDir = path8.join(outDir, "artifacts");
  const bySafe = new Map;
  for (const t of tests) {
    bySafe.set(safeId(t.id), t);
    bySafe.set(safeId(t.id.slice(t.adapter.length + 1)), t);
    bySafe.set(safeId(t.name), t);
  }
  for (const t of tests) {
    for (const a of t.attachments ?? []) {
      if (!fs7.existsSync(a.path) || fs7.statSync(a.path).size > 200 * 1024 * 1024)
        continue;
      const dst = path8.join(artDir, safeId(t.id), path8.basename(a.path));
      if (path8.resolve(a.path) !== dst) {
        fs7.mkdirSync(path8.dirname(dst), { recursive: true });
        fs7.copyFileSync(a.path, dst);
      }
      a.path = path8.relative(runDir, dst);
    }
  }
  const walk = (d, test, dirName) => {
    let es;
    try {
      es = fs7.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path8.join(d, e.name);
      if (e.isDirectory())
        walk(p, test, dirName);
      else {
        const ext = path8.extname(e.name).toLowerCase();
        const ct = MIME[ext] ?? "application/octet-stream";
        const fromAttachment = test?.attachments?.find((a) => path8.resolve(runDir, a.path) === p);
        const step = /^(?:step[-_]?)?(\d+)[-_](.+)\.\w+$/.exec(e.name);
        const entry = { file: path8.relative(runDir, p), artifact_type: artifactType(e.name, fromAttachment?.contentType || ct), test_name: test?.name ?? dirName, test_id: test?.id ?? null, content_type: fromAttachment?.contentType || ct, size_bytes: fileSize(p) };
        if (step) {
          entry.step_index = Number(step[1]);
          entry.step_label = step[2].replace(/[-_]+/g, " ");
        }
        out.push(entry);
      }
    }
  };
  try {
    for (const e of fs7.readdirSync(artDir, { withFileTypes: true })) {
      if (e.isDirectory())
        walk(path8.join(artDir, e.name), bySafe.get(e.name), e.name);
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
    const colon = raw.indexOf(":");
    const pre = colon > 0 ? raw.slice(0, colon) : "";
    const owners = pre in ADAPTERS ? suites.filter((s) => s.adapter === pre) : suites;
    const id = pre in ADAPTERS ? raw.slice(colon + 1) : raw;
    if (!owners.length)
      throw new UsageError(`--select ${raw}: no selected suite uses adapter ${pre}`);
    if (owners.length > 1)
      throw new UsageError(`--select ${raw}: suites ${owners.map((s) => s.name).join(", ")} could all own it; add --suite`);
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
  const suites = pickSuites(cfg, opts.suites);
  const select = splitSelect(suites, opts.select);
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
    release = acquireLock(path9.join(cfg.root, ".witness", "run.lock"));
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
        killGroup(p.pgid, 0);
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
        setupCacheDir: path9.join(cfg.root, ".witness", "cache", "setup"),
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
      }
    }
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
  if (against)
    status.against = { ref: against.ref, outcome: against.outcome, parity: against.parity };
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
  const s = status.summary;
  const parts = [];
  if (s) {
    parts.push(`${s.passed} passed, ${s.failed} failed`);
    if (s.skipped)
      parts.push(`${s.skipped} skipped`);
    if (s.other)
      parts.push(`${s.other} other`);
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
  const logDir = path9.join(o.outDir, "logs");
  fs8.mkdirSync(logDir, { recursive: true });
  const stack = new Stack({ cfg, root: o.root, baseEnv: o.baseEnv, logDir, progress: o.progress, run: o.run, noSetup: o.noSetup, setupCacheDir: o.setupCacheDir, runDirPath: o.run.dir, abort: o.abort, reuse: o.reuseUp ? readUp(cfg.root) : null });
  const isTarget = !o.prefix;
  try {
    if (isTarget)
      o.run.setPhase("deps", "checking dependencies");
    await stack.checkDeps();
    if (isTarget)
      o.run.setPhase("boot", "booting services");
    const wanted = neededServices(cfg, o.suites);
    if (o.origin?.size) {
      const alias = new Map;
      const names = wanted.map((n) => {
        const org = o.origin.get(n);
        if (org)
          alias.set(org.name, n);
        return org?.name ?? n;
      });
      await stack.boot(names, alias);
    } else
      await stack.boot(wanted);
    if (isTarget)
      o.run.setPhase("suite", "running suites");
    const ctx = { cfg, root: o.root, outDir: o.outDir, stack, run: o.run, progress: o.progress, abort: o.abort, baseEnv: o.baseEnv, prefix: o.prefix, activity: o.activity };
    for (const s of o.suites) {
      if (o.abort.aborted)
        break;
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
  const outDir = path9.join(o.run.dir, "against");
  const origin = originMap(cfg);
  if (origin.size) {
    o.progress.line(`against ${opts.against} · using role = "origin" services: ${[...origin.values()].map((s) => s.name).join(", ")}`);
    return runSide(cfg, { ...o, root: cfg.root, outDir, retries: 0, noSetup: opts.noSetup, setupCacheDir: path9.join(cfg.root, ".witness", "cache", "setup-origin"), reuseUp: false, prefix: "origin ", origin });
  }
  const ref = opts.against;
  const resolved = git(cfg.root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!resolved.ok) {
    const d = diagnose({ stage: "config", cause: "bad_config", evidence: `--against ${ref}: not a commit in this repo (${resolved.err})` });
    return { outcome: "mistrial", suites: [], tests: [], diagnosis: d, artifacts: [] };
  }
  const wt = fs8.mkdtempSync(path9.join(os.tmpdir(), "witness-against-"));
  const add = git(cfg.root, ["worktree", "add", "--detach", wt, resolved.out]);
  if (!add.ok) {
    fs8.rmSync(wt, { recursive: true, force: true });
    const d = diagnose({ stage: "config", cause: "bad_config", evidence: `git worktree add failed: ${add.err}` });
    return { outcome: "mistrial", suites: [], tests: [], diagnosis: d, artifacts: [] };
  }
  o.run.state.worktrees.push(wt);
  o.run.saveState();
  o.progress.line(`against ${ref} · checked out ${resolved.out.slice(0, 10)} in ${wt}`);
  try {
    const sub = path9.relative(gitTop(cfg.root), fs8.realpathSync(cfg.root));
    return await runSide(cfg, { ...o, root: path9.join(wt, sub), outDir, retries: 0, noSetup: false, setupCacheDir: null, reuseUp: false, prefix: "origin " });
  } finally {
    git(cfg.root, ["worktree", "remove", "--force", wt]);
    fs8.rmSync(wt, { recursive: true, force: true });
    git(cfg.root, ["worktree", "prune"]);
    o.run.state.worktrees = o.run.state.worktrees.filter((w) => w !== wt);
    o.run.saveState();
  }
}
function gitTop(dir) {
  const r = git(dir, ["rev-parse", "--show-toplevel"]);
  return r.ok ? fs8.realpathSync(r.out) : dir;
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
  const done = (code2) => {
    if (o.json)
      process.stdout.write(JSON.stringify({ ok: code2 === 0, stages: report }, null, 2) + `
`);
    return code2;
  };
  report.push({ stage: "config", ok: true, detail: `${cfg.services.length} service(s), ${cfg.suites.length} suite(s), adapters: ${[...new Set(cfg.suites.map((s) => s.adapter))].join(", ") || "-"}` });
  p.line(`check  config · ok · ${report[0].detail}`);
  if (upTo < 1)
    return done(0);
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
    release = acquireLock(path10.join(cfg.root, ".witness", "run.lock"));
  } catch (e) {
    if (e instanceof LockError) {
      p.plain(color.red(e.message));
      return done(EXIT.error);
    }
    throw e;
  }
  const checkRoot = path10.join(cfg.root, ".witness", "check");
  fs9.rmSync(checkRoot, { recursive: true, force: true });
  const g = gitInfo(cfg.root);
  const run = new RunDir(checkRoot, newRunId(), { commit: g.commit, branch: g.branch, dirty: g.dirty, label: "check" });
  const abort = { aborted: false };
  const onSig = () => abort.aborted = true;
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
  const stack = new Stack({ cfg, root: cfg.root, baseEnv: env, logDir: run.file("logs"), progress: p, run, noSetup: o.noSetup, setupCacheDir: path10.join(cfg.root, ".witness", "cache", "setup"), runDirPath: run.dir, abort, reuse: readUp(cfg.root) });
  let code = 0;
  try {
    await stack.checkDeps();
    report.push({ stage: "deps", ok: true, detail: `${cfg.dependencies.length} dependency check(s) passed` });
    if (upTo < 2)
      return done(0);
    const services = o.service ? [o.service] : cfg.services.filter((s) => s.role === "target").map((s) => s.name);
    for (const s of services)
      if (!cfg.services.some((x) => x.name === s))
        throw new Error(`unknown service "${s}"`);
    await stack.boot(services);
    report.push({ stage: "boot", ok: true, detail: [...stack.live.values()].map((l) => `${l.svc.name} at ${l.url}`).join(", ") || "no services" });
    if (upTo < 3)
      return done(0);
    const suites = pickSuites(cfg, o.suites).filter((s) => !o.service || !s.services || s.services.includes(o.service));
    const ctx = { cfg, root: cfg.root, outDir: run.dir, stack, run, progress: p, abort, baseEnv: env, activity: { text: "" } };
    for (const s of suites) {
      const ad = ADAPTERS[s.adapter];
      const listCmd = ad.list?.cmd(s.cmd);
      if (listCmd) {
        const r2 = await runCapture(listCmd, { cwd: path10.resolve(cfg.root, s.cwd), env: childEnv(env, stack.serviceUrlEnv()), timeoutMs: 5 * 60000, log: run.file("logs", `${s.name}.list.log`) });
        const ids = r2.code === 0 ? ad.list.parse(r2.out) : [];
        if (ids.length) {
          report.push({ stage: "suite", ok: true, detail: `${s.name}: ${ids.length} test(s) listed` });
          p.line(`check  suite ${s.name} · ${ids.length} test(s) listed, e.g. ${s.adapter}:${ids[0]}`);
          continue;
        }
        p.line(`check  suite ${s.name} · listing gave no tests (exit ${r2.code}); doing a smoke run`);
      }
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
    run.status.phase = "finished";
    run.saveStatus();
    release();
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }
  if (abort.aborted)
    code = EXIT.interrupted;
  p.plain(code === 0 ? color.green("CHECK ok") : color.yellow(`CHECK failed · logs: ${run.file("logs")}`));
  return done(code);
}
async function upCommand(cfg, o) {
  const p = new Progress;
  const existing = readUp(cfg.root);
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
  const logDir = path10.join(cfg.root, ".witness", "up", "logs");
  fs9.mkdirSync(logDir, { recursive: true });
  const abort = { aborted: false };
  const stack = new Stack({ cfg, root: cfg.root, baseEnv: env, logDir, progress: p, noSetup: o.noSetup, setupCacheDir: path10.join(cfg.root, ".witness", "cache", "setup"), abort });
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
  const state = readUp(cfg.root);
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
      await runCapture(svc.stop, { cwd: path10.resolve(cfg.root, svc.cwd), env: childEnv(env, { PORT: String(s.port ?? "") }), timeoutMs: 60000, log: s.log });
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
  fs9.rmSync(upFile(cfg.root), { force: true });
  if (o.json)
    process.stdout.write(JSON.stringify({ ok: true }) + `
`);
  return 0;
}
function statusCommand(runRoot, id, json) {
  const dir = resolveRun(runRoot, id);
  const st = dir ? readJson(path10.join(dir, "status.json"), null) : null;
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
  const st = dir ? readJson(path10.join(dir, "status.json"), null) : null;
  if (!dir || !st) {
    process.stderr.write(`witness  no run found${id ? ` for ${id}` : ""} under ${runRoot}
`);
    return EXIT.error;
  }
  const ctrf = readJson(path10.join(dir, "results.ctrf.json"), null);
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
import * as fs10 from "node:fs";
import * as path11 from "node:path";
var read = (f) => {
  try {
    return fs10.readFileSync(f, "utf8");
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
  const dirOf = (f) => path11.dirname(f) || ".";
  const py = has(/(^|\/)(pytest\.ini|conftest\.py|pyproject\.toml|setup\.cfg|tox\.ini)$/).filter((f) => /pytest\.ini|conftest\.py/.test(f) || /\[tool\.pytest|\[tool:pytest\]|\[pytest\]|pytest/.test(read(path11.join(root, f))));
  const pyDirs = [...new Set(py.map(dirOf))].filter((d, _i, a) => !a.some((o) => o !== d && (d.startsWith(`${o}/`) || o === ".")) || d === ".");
  for (const d of pyDirs.slice(0, 3))
    g.suites.push({ name: name(d === "." ? "pytest" : `${path11.basename(d)}-pytest`), adapter: "pytest", cwd: d, cmd: "python -m pytest", why: `found ${py.find((f) => dirOf(f) === d)}` });
  const pom = has(/(^|\/)pom\.xml$/).sort((a, b) => a.length - b.length)[0];
  if (pom) {
    g.suites.push({ name: name("maven-tests"), adapter: "junit-maven", cwd: dirOf(pom), cmd: "mvn -B verify", why: `found ${pom}` });
    if (/spring-boot/.test(read(path11.join(root, pom))))
      g.services.push({ name: name("app"), cwd: dirOf(pom), setup: "mvn -B -DskipTests package", start: "mvn -B spring-boot:run -Dspring-boot.run.arguments=--server.port=${PORT}", ready: "${self.url}/actuator/health", why: "spring-boot in pom.xml" });
  }
  const gradle = has(/(^|\/)build\.gradle(\.kts)?$/).sort((a, b) => a.length - b.length)[0];
  if (gradle)
    g.suites.push({ name: name("gradle-tests"), adapter: "junit-gradle", cwd: dirOf(gradle), cmd: fs10.existsSync(path11.join(root, dirOf(gradle), "gradlew")) ? "./gradlew test" : "gradle test", why: `found ${gradle}` });
  const csproj = has(/\.csproj$/);
  const testProjects = csproj.filter((f) => /Microsoft\.NET\.Test\.Sdk|xunit|NUnit|MSTest/i.test(read(path11.join(root, f))));
  const sln = has(/\.(sln|slnx)$/).sort((a, b) => a.length - b.length)[0];
  if (testProjects.length && testProjects.length <= 6) {
    for (const f of testProjects)
      g.suites.push({ name: name(path11.basename(f, ".csproj")), adapter: "dotnet", cwd: ".", cmd: `dotnet test ${f}`, why: `test project ${f}` });
  } else if (testProjects.length || sln)
    g.suites.push({ name: name("dotnet-tests"), adapter: "dotnet", cwd: sln ? dirOf(sln) : ".", cmd: sln ? `dotnet test ${path11.basename(sln)}` : "dotnet test", why: sln ? `found ${sln}` : "test projects found" });
  for (const f of csproj.filter((f2) => /Sdk="Microsoft\.NET\.Sdk\.Web"/.test(read(path11.join(root, f2)))).slice(0, 3)) {
    g.services.push({ name: name(path11.basename(f, ".csproj")), cwd: ".", setup: `dotnet build ${f}`, start: `dotnet run --no-build --project ${f} --urls http://127.0.0.1:\${PORT}`, ready: "${self.url}/", why: `web project ${f}` });
  }
  for (const pj of has(/(^|\/)package\.json$/).filter((f) => f.split("/").length <= 3)) {
    let doc;
    try {
      doc = JSON.parse(read(path11.join(root, pj)));
    } catch {
      continue;
    }
    const deps = { ...doc.dependencies, ...doc.devDependencies };
    const d = dirOf(pj);
    const base = d === "." ? "" : `${path11.basename(d)}-`;
    if (deps["@playwright/test"])
      g.suites.push({ name: name(`${base}playwright`), adapter: "playwright", cwd: d, cmd: "npx playwright test", why: `@playwright/test in ${pj}` });
    if (deps.vitest)
      g.suites.push({ name: name(`${base}vitest`), adapter: "vitest", cwd: d, cmd: "npx vitest run", why: `vitest in ${pj}` });
    if (deps.jest)
      g.suites.push({ name: name(`${base}jest`), adapter: "jest", cwd: d, cmd: "npx jest", why: `jest in ${pj}` });
    if (deps.mocha)
      g.suites.push({ name: name(`${base}mocha`), adapter: "mocha", cwd: d, cmd: "npx mocha", why: `mocha in ${pj}` });
    if (doc.scripts?.start)
      g.services.push({ name: name(`${base}web`.replace(/-$/, "")), cwd: d, setup: fs10.existsSync(path11.join(root, d, "package-lock.json")) ? "npm ci" : "npm install", start: "npm start", ready: "${self.url}/", why: `start script in ${pj}` });
  }
  const gomod = has(/(^|\/)go\.mod$/).sort((a, b) => a.length - b.length)[0];
  if (gomod)
    g.suites.push({ name: name("go-tests"), adapter: "go", cwd: dirOf(gomod), cmd: "go test ./...", why: `found ${gomod}` });
  const gem = has(/(^|\/)Gemfile$/).find((f) => /rspec/.test(read(path11.join(root, f))));
  if (gem)
    g.suites.push({ name: name("rspec"), adapter: "rspec", cwd: dirOf(gem), cmd: "bundle exec rspec", why: `rspec in ${gem}` });
  const php = has(/(^|\/)phpunit\.xml(\.dist)?$/)[0];
  if (php)
    g.suites.push({ name: name("phpunit"), adapter: "phpunit", cwd: dirOf(php), cmd: "vendor/bin/phpunit", why: `found ${php}` });
  if (fs10.existsSync(path11.join(root, "manage.py")))
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
  const dir = path11.join(root, ".witness");
  fs10.mkdirSync(dir, { recursive: true });
  const example = path11.join(dir, "witness.example.toml");
  fs10.writeFileSync(example, renderExample(g));
  const gi = path11.join(dir, ".gitignore");
  if (!fs10.existsSync(gi))
    fs10.writeFileSync(gi, `runs/
check/
cache/
up/
up.json
run.lock
.env
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
    if (!fs10.existsSync(path11.join(dir, "witness.toml")))
      process.stderr.write(`witness  review it, then: mv ${example} ${path11.join(dir, "witness.toml")}
`);
  }
  return 0;
}

// src/cli.ts
var HELP = `witness ${VERSION}: boot the app, run its own tests, and record results you can trust.

Usage:
  witness check  [--stage config|deps|boot|suite] [--service s] [--suite s] [--no-setup]
  witness run    [--suite s]... [--select id,...] [--retries n] [--no-setup] [--against <git-ref>] [--label name]
  witness up     [--service s] [--no-setup]        start services and leave them running (run reuses them)
  witness down                                    stop what \`witness up\` started
  witness status [run-id|latest]
  witness report [run-id|latest] [--format md|json]
  witness init                                    write .witness/witness.example.toml guessed from the repo

Common: --json (machine output on stdout) · --config <path> (default .witness/witness.toml)
        --run-dir-root <path> (default .witness/runs)
Exit codes: 0 passed · 1 failed · 2 error · 3 mistrial · 4 stalled/timeout · 5 interrupted · 64 usage`;
var VALUE_FLAGS = new Set(["config", "run-dir-root", "stage", "service", "suite", "select", "retries", "against", "label", "format"]);
var BOOL_FLAGS = new Set(["json", "no-setup", "help", "version"]);
var REPEAT = new Set(["suite", "select"]);
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
      (lists[k] ??= []).push(...k === "select" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [v]);
    else
      flags[k] = v;
  }
  return { cmd: pos[0], pos: pos.slice(1), flags, lists };
}
function configPath(flags) {
  if (typeof flags.config === "string")
    return path12.resolve(flags.config);
  const found = findConfig(process.cwd());
  if (!found)
    throw new ConfigError("", "no .witness/witness.toml here or in a parent folder; run `witness init`");
  return found;
}
function runRoot(flags, root) {
  return typeof flags["run-dir-root"] === "string" ? path12.resolve(flags["run-dir-root"]) : path12.join(root, ".witness", "runs");
}
async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`witness  ${e.message}

${HELP}
`);
    return EXIT_USAGE;
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
    return cmd || flags.help ? 0 : EXIT_USAGE;
  }
  const json = !!flags.json;
  let cfg;
  const needsConfig = ["check", "run", "up", "down"].includes(cmd);
  try {
    if (cmd === "init")
      return initCommand(process.cwd(), json);
    if (cmd === "status" || cmd === "report") {
      const cp = typeof flags.config === "string" ? path12.resolve(flags.config) : findConfig(process.cwd());
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
      throw new UsageError(`unknown command "${cmd}"${["plan", "lint", "skills"].includes(cmd) ? " (not in this build yet)" : ""}`);
    cfg = loadConfig(configPath(flags));
    const rr = runRoot(flags, cfg.root);
    switch (cmd) {
      case "check": {
        const stage = flags.stage;
        if (stage && !["config", "deps", "boot", "suite"].includes(stage))
          throw new UsageError(`--stage must be config, deps, boot or suite`);
        if (typeof flags.service === "string" && !cfg.services.some((s) => s.name === flags.service))
          throw new UsageError(`unknown service "${flags.service}"`);
        return await checkCommand(cfg, { stage, service: flags.service, suites: lists.suite, json, noSetup: !!flags["no-setup"] });
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
      return EXIT_USAGE;
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
  return EXIT_USAGE;
}
var EXIT_USAGE = 64;
var self = process.argv[1] ? fs11.realpathSync(process.argv[1]) : "";
if (self.endsWith("cli.ts") || self.endsWith("witness.mjs")) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`witness  internal error: ${e.stack ?? e}
`);
    process.exit(EXIT.error);
  });
}
export {
  parseArgs,
  main,
  EXIT_USAGE
};
