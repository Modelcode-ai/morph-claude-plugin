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

// engine/node_modules/fast-xml-parser/src/util.js
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
  exports.isName = isName;
  exports.getAllMatches = getAllMatches;
  exports.nameRegexp = nameRegexp;
});

// engine/node_modules/fast-xml-parser/src/validator.js
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

// engine/node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var require_OptionsBuilder = __commonJS((exports) => {
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
    tagValueProcessor: function(tagName, val2) {
      return val2;
    },
    attributeValueProcessor: function(attrName, val2) {
      return val2;
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
    }
  };
  var buildOptions = function(options) {
    return Object.assign({}, defaultOptions, options);
  };
  exports.buildOptions = buildOptions;
  exports.defaultOptions = defaultOptions;
});

// engine/node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var require_xmlNode = __commonJS((exports, module) => {
  class XmlNode {
    constructor(tagname) {
      this.tagname = tagname;
      this.child = [];
      this[":@"] = {};
    }
    add(key, val2) {
      if (key === "__proto__")
        key = "#__proto__";
      this.child.push({ [key]: val2 });
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

// engine/node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
var require_DocTypeReader = __commonJS((exports, module) => {
  var util = require_util();
  function readDocType(xmlData, i) {
    const entities = {};
    if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
      i = i + 9;
      let angleBracketsCount = 1;
      let hasBody = false, comment = false;
      let exp = "";
      for (;i < xmlData.length; i++) {
        if (xmlData[i] === "<" && !comment) {
          if (hasBody && isEntity(xmlData, i)) {
            i += 7;
            [entityName, val, i] = readEntityExp(xmlData, i + 1);
            if (val.indexOf("&") === -1)
              entities[validateEntityName(entityName)] = {
                regx: RegExp(`&${entityName};`, "g"),
                val
              };
          } else if (hasBody && isElement(xmlData, i))
            i += 8;
          else if (hasBody && isAttlist(xmlData, i))
            i += 8;
          else if (hasBody && isNotation(xmlData, i))
            i += 9;
          else if (isComment)
            comment = true;
          else
            throw new Error("Invalid DOCTYPE");
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
  function readEntityExp(xmlData, i) {
    let entityName2 = "";
    for (;i < xmlData.length && (xmlData[i] !== "'" && xmlData[i] !== '"'); i++) {
      entityName2 += xmlData[i];
    }
    entityName2 = entityName2.trim();
    if (entityName2.indexOf(" ") !== -1)
      throw new Error("External entites are not supported");
    const startChar = xmlData[i++];
    let val2 = "";
    for (;i < xmlData.length && xmlData[i] !== startChar; i++) {
      val2 += xmlData[i];
    }
    return [entityName2, val2, i];
  }
  function isComment(xmlData, i) {
    if (xmlData[i + 1] === "!" && xmlData[i + 2] === "-" && xmlData[i + 3] === "-")
      return true;
    return false;
  }
  function isEntity(xmlData, i) {
    if (xmlData[i + 1] === "!" && xmlData[i + 2] === "E" && xmlData[i + 3] === "N" && xmlData[i + 4] === "T" && xmlData[i + 5] === "I" && xmlData[i + 6] === "T" && xmlData[i + 7] === "Y")
      return true;
    return false;
  }
  function isElement(xmlData, i) {
    if (xmlData[i + 1] === "!" && xmlData[i + 2] === "E" && xmlData[i + 3] === "L" && xmlData[i + 4] === "E" && xmlData[i + 5] === "M" && xmlData[i + 6] === "E" && xmlData[i + 7] === "N" && xmlData[i + 8] === "T")
      return true;
    return false;
  }
  function isAttlist(xmlData, i) {
    if (xmlData[i + 1] === "!" && xmlData[i + 2] === "A" && xmlData[i + 3] === "T" && xmlData[i + 4] === "T" && xmlData[i + 5] === "L" && xmlData[i + 6] === "I" && xmlData[i + 7] === "S" && xmlData[i + 8] === "T")
      return true;
    return false;
  }
  function isNotation(xmlData, i) {
    if (xmlData[i + 1] === "!" && xmlData[i + 2] === "N" && xmlData[i + 3] === "O" && xmlData[i + 4] === "T" && xmlData[i + 5] === "A" && xmlData[i + 6] === "T" && xmlData[i + 7] === "I" && xmlData[i + 8] === "O" && xmlData[i + 9] === "N")
      return true;
    return false;
  }
  function validateEntityName(name) {
    if (util.isName(name))
      return name;
    else
      throw new Error(`Invalid entity name ${name}`);
  }
  module.exports = readDocType;
});

// engine/node_modules/strnum/strnum.js
var require_strnum = __commonJS((exports, module) => {
  var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
  var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
  var consider = {
    hex: true,
    leadingZeros: true,
    decimalPoint: ".",
    eNotation: true
  };
  function toNumber(str, options = {}) {
    options = Object.assign({}, consider, options);
    if (!str || typeof str !== "string")
      return str;
    let trimmedStr = str.trim();
    if (options.skipLike !== undefined && options.skipLike.test(trimmedStr))
      return str;
    else if (str === "0")
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
            return str;
          }
        }
        return options.eNotation ? Number(trimmedStr) : str;
      } else {
        return str;
      }
    } else {
      const match = numRegex.exec(trimmedStr);
      if (match) {
        const sign = match[1];
        const leadingZeros = match[2];
        let numTrimmedByZeros = trimZeros(match[3]);
        if (!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".")
          return str;
        else if (!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".")
          return str;
        else if (options.leadingZeros && leadingZeros === str)
          return 0;
        else {
          const num = Number(trimmedStr);
          const numStr = "" + num;
          if (numStr.search(/[eE]/) !== -1) {
            if (options.eNotation)
              return num;
            else
              return str;
          } else if (trimmedStr.indexOf(".") !== -1) {
            if (numStr === "0" && numTrimmedByZeros === "")
              return num;
            else if (numStr === numTrimmedByZeros)
              return num;
            else if (sign && numStr === "-" + numTrimmedByZeros)
              return num;
            else
              return str;
          }
          if (leadingZeros) {
            return numTrimmedByZeros === numStr || sign + numTrimmedByZeros === numStr ? num : str;
          } else {
            return trimmedStr === numStr || trimmedStr === sign + numStr ? num : str;
          }
        }
      } else {
        return str;
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

// engine/node_modules/fast-xml-parser/src/ignoreAttributes.js
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

// engine/node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
var require_OrderedObjParser = __commonJS((exports, module) => {
  var util = require_util();
  var xmlNode = require_xmlNode();
  var readDocType = require_DocTypeReader();
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
        num_dec: { regex: /&#([0-9]{1,7});/g, val: (_, str) => String.fromCharCode(Number.parseInt(str, 10)) },
        num_hex: { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str) => String.fromCharCode(Number.parseInt(str, 16)) }
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
    }
  }
  function addExternalEntities(externalEntities) {
    const entKeys = Object.keys(externalEntities);
    for (let i = 0;i < entKeys.length; i++) {
      const ent = entKeys[i];
      this.lastEntities[ent] = {
        regex: new RegExp("&" + ent + ";", "g"),
        val: externalEntities[ent]
      };
    }
  }
  function parseTextData(val2, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
    if (val2 !== undefined) {
      if (this.options.trimValues && !dontTrim) {
        val2 = val2.trim();
      }
      if (val2.length > 0) {
        if (!escapeEntities)
          val2 = this.replaceEntitiesValue(val2);
        const newval = this.options.tagValueProcessor(tagName, val2, jPath, hasAttributes, isLeafNode);
        if (newval === null || newval === undefined) {
          return val2;
        } else if (typeof newval !== typeof val2 || newval !== val2) {
          return newval;
        } else if (this.options.trimValues) {
          return parseValue2(val2, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          const trimmedVal = val2.trim();
          if (trimmedVal === val2) {
            return parseValue2(val2, this.options.parseTagValue, this.options.numberParseOptions);
          } else {
            return val2;
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
          if (aName === "__proto__")
            aName = "#__proto__";
          if (oldVal !== undefined) {
            if (this.options.trimValues) {
              oldVal = oldVal.trim();
            }
            oldVal = this.replaceEntitiesValue(oldVal);
            const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
            if (newVal === null || newVal === undefined) {
              attrs[aName] = oldVal;
            } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
              attrs[aName] = newVal;
            } else {
              attrs[aName] = parseValue2(oldVal, this.options.parseAttributeValue, this.options.numberParseOptions);
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
            this.addChild(currentNode, childNode, jPath);
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
          const result = readDocType(xmlData, i);
          this.docTypeEntities = result.entities;
          i = result.i;
        } else if (xmlData.substr(i + 1, 2) === "![") {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
          const tagExp = xmlData.substring(i + 9, closeIndex);
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
          let val2 = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true, true);
          if (val2 == undefined)
            val2 = "";
          if (this.options.cdataPropName) {
            currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
          } else {
            currentNode.add(this.options.textNodeName, val2);
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
            tagName = this.options.transformTagName(tagName);
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
          if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) {
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
            this.addChild(currentNode, childNode, jPath);
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
                tagName = this.options.transformTagName(tagName);
              }
              const childNode = new xmlNode(tagName);
              if (tagName !== tagExp && attrExpPresent) {
                childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
              }
              this.addChild(currentNode, childNode, jPath);
              jPath = jPath.substr(0, jPath.lastIndexOf("."));
            } else {
              const childNode = new xmlNode(tagName);
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
  function addChild(currentNode, childNode, jPath) {
    const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
    if (result === false) {} else if (typeof result === "string") {
      childNode.tagname = result;
      currentNode.addChild(childNode);
    } else {
      currentNode.addChild(childNode);
    }
  }
  var replaceEntitiesValue = function(val2) {
    if (this.options.processEntities) {
      for (let entityName2 in this.docTypeEntities) {
        const entity = this.docTypeEntities[entityName2];
        val2 = val2.replace(entity.regx, entity.val);
      }
      for (let entityName2 in this.lastEntities) {
        const entity = this.lastEntities[entityName2];
        val2 = val2.replace(entity.regex, entity.val);
      }
      if (this.options.htmlEntities) {
        for (let entityName2 in this.htmlEntities) {
          const entity = this.htmlEntities[entityName2];
          val2 = val2.replace(entity.regex, entity.val);
        }
      }
      val2 = val2.replace(this.ampEntity.regex, this.ampEntity.val);
    }
    return val2;
  };
  function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
    if (textData) {
      if (isLeafNode === undefined)
        isLeafNode = Object.keys(currentNode.child).length === 0;
      textData = this.parseTextData(textData, currentNode.tagname, jPath, false, currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false, isLeafNode);
      if (textData !== undefined && textData !== "")
        currentNode.add(this.options.textNodeName, textData);
      textData = "";
    }
    return textData;
  }
  function isItStopNode(stopNodes, jPath, currentTagName) {
    const allNodesExp = "*." + currentTagName;
    for (const stopNodePath in stopNodes) {
      const stopNodeExp = stopNodes[stopNodePath];
      if (allNodesExp === stopNodeExp || jPath === stopNodeExp)
        return true;
    }
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
  function findClosingIndex(xmlData, str, i, errMsg) {
    const closingIndex = xmlData.indexOf(str, i);
    if (closingIndex === -1) {
      throw new Error(errMsg);
    } else {
      return closingIndex + str.length - 1;
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
  function parseValue2(val2, shouldParse, options) {
    if (shouldParse && typeof val2 === "string") {
      const newval = val2.trim();
      if (newval === "true")
        return true;
      else if (newval === "false")
        return false;
      else
        return toNumber(val2, options);
    } else {
      if (util.isExist(val2)) {
        return val2;
      } else {
        return "";
      }
    }
  }
  module.exports = OrderedObjParser;
});

// engine/node_modules/fast-xml-parser/src/xmlparser/node2json.js
var require_node2json = __commonJS((exports) => {
  function prettify(node, options) {
    return compress(node, options);
  }
  function compress(arr, options, jPath) {
    let text;
    const compressedObj = {};
    for (let i = 0;i < arr.length; i++) {
      const tagObj = arr[i];
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
        let val2 = compress(tagObj[property], options, newJpath);
        const isLeaf = isLeafTag(val2, options);
        if (tagObj[":@"]) {
          assignAttributes(val2, tagObj[":@"], newJpath, options);
        } else if (Object.keys(val2).length === 1 && val2[options.textNodeName] !== undefined && !options.alwaysCreateTextNode) {
          val2 = val2[options.textNodeName];
        } else if (Object.keys(val2).length === 0) {
          if (options.alwaysCreateTextNode)
            val2[options.textNodeName] = "";
          else
            val2 = "";
        }
        if (compressedObj[property] !== undefined && compressedObj.hasOwnProperty(property)) {
          if (!Array.isArray(compressedObj[property])) {
            compressedObj[property] = [compressedObj[property]];
          }
          compressedObj[property].push(val2);
        } else {
          if (options.isArray(property, newJpath, isLeaf)) {
            compressedObj[property] = [val2];
          } else {
            compressedObj[property] = val2;
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

// engine/node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
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

// engine/node_modules/fast-xml-parser/src/xmlbuilder/orderedJs2Xml.js
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
  function arrToStr(arr, options, jPath, indentation) {
    let xmlStr = "";
    let isPreviousElementTag = false;
    for (let i = 0;i < arr.length; i++) {
      const tagObj = arr[i];
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
        xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
        isPreviousElementTag = false;
        continue;
      } else if (tagName === options.commentPropName) {
        xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
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
      if (!obj.hasOwnProperty(key))
        continue;
      if (key !== ":@")
        return key;
    }
  }
  function attr_to_str(attrMap, options) {
    let attrStr = "";
    if (attrMap && !options.ignoreAttributes) {
      for (let attr in attrMap) {
        if (!attrMap.hasOwnProperty(attr))
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

// engine/node_modules/fast-xml-parser/src/xmlbuilder/json2xml.js
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
    let val2 = "";
    const jPath = ajPath.join(".");
    for (let key in jObj) {
      if (!Object.prototype.hasOwnProperty.call(jObj, key))
        continue;
      if (typeof jObj[key] === "undefined") {
        if (this.isAttribute(key)) {
          val2 += "";
        }
      } else if (jObj[key] === null) {
        if (this.isAttribute(key)) {
          val2 += "";
        } else if (key[0] === "?") {
          val2 += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
        } else {
          val2 += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
        }
      } else if (jObj[key] instanceof Date) {
        val2 += this.buildTextValNode(jObj[key], key, "", level);
      } else if (typeof jObj[key] !== "object") {
        const attr = this.isAttribute(key);
        if (attr && !this.ignoreAttributesFn(attr, jPath)) {
          attrStr += this.buildAttrPairStr(attr, "" + jObj[key]);
        } else if (!attr) {
          if (key === this.options.textNodeName) {
            let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
            val2 += this.replaceEntitiesValue(newval);
          } else {
            val2 += this.buildTextValNode(jObj[key], key, "", level);
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
              val2 += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
            else
              val2 += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
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
        val2 += listTagVal;
      } else {
        if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
          const Ks = Object.keys(jObj[key]);
          const L = Ks.length;
          for (let j = 0;j < L; j++) {
            attrStr += this.buildAttrPairStr(Ks[j], "" + jObj[key][Ks[j]]);
          }
        } else {
          val2 += this.processTextOrObjNode(jObj[key], key, level, ajPath);
        }
      }
    }
    return { attrStr, val: val2 };
  };
  Builder.prototype.buildAttrPairStr = function(attrName, val2) {
    val2 = this.options.attributeValueProcessor(attrName, "" + val2);
    val2 = this.replaceEntitiesValue(val2);
    if (this.options.suppressBooleanAttributes && val2 === "true") {
      return " " + attrName;
    } else
      return " " + attrName + '="' + val2 + '"';
  };
  function processTextOrObjNode(object, key, level, ajPath) {
    const result = this.j2x(object, level + 1, ajPath.concat(key));
    if (object[this.options.textNodeName] !== undefined && Object.keys(object).length === 1) {
      return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
    } else {
      return this.buildObjectNode(result.val, key, result.attrStr, level);
    }
  }
  Builder.prototype.buildObjectNode = function(val2, key, attrStr, level) {
    if (val2 === "") {
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
      if ((attrStr || attrStr === "") && val2.indexOf("<") === -1) {
        return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val2 + tagEndExp;
      } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
        return this.indentate(level) + `<!--${val2}-->` + this.newLine;
      } else {
        return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val2 + this.indentate(level) + tagEndExp;
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
  Builder.prototype.buildTextValNode = function(val2, key, attrStr, level) {
    if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
      return this.indentate(level) + `<![CDATA[${val2}]]>` + this.newLine;
    } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
      return this.indentate(level) + `<!--${val2}-->` + this.newLine;
    } else if (key[0] === "?") {
      return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
    } else {
      let textValue = this.options.tagValueProcessor(key, val2);
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

// engine/node_modules/fast-xml-parser/src/fxp.js
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

// engine/src/cli.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import * as fs9 from "node:fs";
import * as path9 from "node:path";

// engine/src/claims.ts
import * as fs from "node:fs";
import * as path from "node:path";
var TAGS = ["parity", "changed", "new", "judged"];
function frontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m)
    return { meta: {}, body: src, offset: 0 };
  const meta = {};
  for (const line of m[1].split(`
`)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (kv)
      meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: src.slice(m[0].length), offset: m[0].split(`
`).length - 1 };
}
var CLAIM_RE = /^-\s+([A-Za-z][\w.-]*)\s+\[([^\]]*)\]\s+(.+)$/;
var FIELD_RE = /^\s{2,}([\w-]+):\s*(.*)$/;
function parseClaimFile(file, src) {
  const { meta, body, offset } = frontmatter(src);
  const feature = meta.feature || path.basename(file, ".md");
  const claims = [];
  let cur = null;
  body.split(`
`).forEach((line, i) => {
    const m = CLAIM_RE.exec(line);
    if (m) {
      const labels = m[2].split(",").map((s) => s.trim()).filter(Boolean);
      cur = {
        id: m[1],
        text: m[3].trim(),
        surfaces: labels.filter((l) => !TAGS.includes(l)),
        tags: labels.filter((l) => TAGS.includes(l)),
        expectDiff: [],
        feature,
        change: meta.change,
        file,
        line: i + 1 + offset
      };
      claims.push(cur);
      return;
    }
    const f = FIELD_RE.exec(line);
    if (f && cur) {
      const [, key, val2] = f;
      if (key === "proof")
        cur.proof = val2.trim();
      else if (key === "evidence")
        cur.evidence = val2.trim();
      else if (key === "expect-diff")
        cur.expectDiff = val2.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "retired")
        cur.retired = val2.trim();
      return;
    }
    if (cur && /^\s{2,}\S/.test(line) && !f)
      cur.text += " " + line.trim();
  });
  return { file, feature, change: meta.change, raw: src, claims };
}
function loadClaims(witnessDir) {
  const dir = path.join(witnessDir, "claims");
  if (!fs.existsSync(dir))
    return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => parseClaimFile(path.join(dir, f), fs.readFileSync(path.join(dir, f), "utf8")));
}
function normalizeTestId(ref) {
  const [cls, method = ""] = ref.split("#");
  const simple = cls.split(/[.$/]/).pop() || cls;
  return `${simple}#${method.replace(/\(.*\)$/, "").trim()}`;
}

// engine/src/contract.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// engine/node_modules/smol-toml/dist/error.js
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
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
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
}

// engine/node_modules/smol-toml/dist/util.js
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
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf(`
`, start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr;i < str.length; i++) {
    let c = str[i];
    if (c === `
`)
      return i;
    if (c === "\r" && str[i + 1] === `
`)
      return i + 1;
    if (c < " " && c !== "\t" || c === "") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while ((c = str[ptr]) === " " || c === "\t" || !banNewLines && (c === `
` || c === "\r" && str[ptr + 1] === `
`))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr;i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep) {
      return i + 1;
    } else if (c === end) {
      return i;
    } else if (banNewLines && (c === `
` || c === "\r" && str[i + 1] === `
`)) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && str[seek - 1] === "\\" && str[seek - 2] !== "\\");
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}

// engine/node_modules/smol-toml/dist/date.js
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
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}:\d{2}(?:\.\d+)?)?(Z|[-+]\d{2}:\d{2})?$/i;

class TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
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
    if (this.#offset === "Z")
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

// engine/node_modules/smol-toml/dist/primitive.js
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
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
var ESCAPE_REGEX = /^[0-9a-f]{4,8}$/i;
var ESC_MAP = {
  b: "\b",
  t: "\t",
  n: `
`,
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === `
`)
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === `
` || c === "\r" && str[ptr] === `
`) {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "\t" || c === "") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === `
` || c === " " || c === "\t" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== `
` && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return 0;
  let isInt;
  if ((isInt = INT_REGEX.test(value)) || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    let numeric = +value.replace(/_/g, "");
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt && !Number.isSafeInteger(numeric)) {
      throw new TomlError("integer value cannot be represented losslessly", {
        toml,
        ptr
      });
    }
    return numeric;
  }
  let date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// engine/node_modules/smol-toml/dist/extract.js
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
function sliceAndTrimEndOf(str, startPtr, endPtr, allowNewLines) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  let trimmed = value.trimEnd();
  if (!allowNewLines) {
    let newlineIdx = value.indexOf(`
`, trimmed.length);
    if (newlineIdx > -1) {
      throw new TomlError("newlines are not allowed in inline tables", {
        toml: str,
        ptr: startPtr + newlineIdx
      });
    }
  }
  return [trimmed, commentIdx];
}
function extractValue(str, ptr, end, depth) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth) : parseInlineTable(str, ptr, depth);
    let newPtr = skipUntil(str, endPtr2, ",", end);
    if (end === "}") {
      let nextNewLine = indexOfNewline(str, endPtr2, newPtr);
      if (nextNewLine > -1) {
        throw new TomlError("newlines are not allowed in inline tables", {
          toml: str,
          ptr: nextNewLine
        });
      }
    }
    return [value, newPtr];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr, end !== "]");
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== `
` && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","), end === "]");
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr),
    endPtr
  ];
}

// engine/node_modules/smol-toml/dist/struct.js
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
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "\t") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth) {
  let res = {};
  let seen = new Set;
  let c;
  let comma = 0;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === `
`) {
      throw new TomlError("newlines are not allowed in inline tables", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#") {
      throw new TomlError("inline tables cannot contain comments", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === ",") {
      throw new TomlError("expected key-value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c !== " " && c !== "\t") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0;i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
      comma = str[ptr - 1] === "," ? ptr - 1 : 0;
    }
  }
  if (comma) {
    throw new TomlError("trailing commas are not allowed in inline tables", {
      toml: str,
      ptr: comma
    });
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "\t" && c !== `
` && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// engine/node_modules/smol-toml/dist/parse.js
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
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0;i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
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
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
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
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, opts) {
  let maxDepth = opts?.maxDepth ?? 1000;
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0);ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(k[0], res, meta, isTableArray ? 2 : 1);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(k[0], tbl, m, 0);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], undefined, maxDepth);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== `
` && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// engine/node_modules/smol-toml/dist/stringify.js
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

// engine/node_modules/smol-toml/dist/index.js
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

// engine/src/contract.ts
class ContractError extends Error {
}
function mapRoute(routes, url) {
  const [p, q] = url.split("?", 2);
  for (const r of routes) {
    if (!r.prefix && p === r.target)
      return r.origin + (q ? `?${q}` : "");
    if (r.prefix && p.startsWith(r.target))
      return r.origin + p.slice(r.target.length) + (q ? `?${q}` : "");
  }
  return url;
}
var DEFAULT_EQ = {
  ignore_fields: [],
  unordered: [],
  headers: ["content-type"],
  compare_status: true,
  allow_added_fields: false
};
function parseEquivalence(text) {
  if (!text)
    return { ...DEFAULT_EQ };
  try {
    const eq = parse(text);
    return { ...DEFAULT_EQ, ...eq.http ?? eq };
  } catch (e) {
    throw new ContractError(`equivalence.toml does not parse: ${e.message}`);
  }
}
function findRoot(start) {
  let dir = path2.resolve(start);
  for (;; ) {
    if (fs2.existsSync(path2.join(dir, ".witness", "witness.toml")))
      return dir;
    const up = path2.dirname(dir);
    if (up === dir)
      return null;
    dir = up;
  }
}
function loadContract(root) {
  const home = path2.join(root, ".witness");
  const file = path2.join(home, "witness.toml");
  if (!fs2.existsSync(file))
    throw new ContractError(`No contract at ${file}. Run \`witness init\` first.`);
  const raw = fs2.readFileSync(file, "utf8");
  let doc;
  try {
    doc = parse(raw);
  } catch (e) {
    throw new ContractError(`witness.toml does not parse: ${e.message}`);
  }
  const services = (doc.service ?? []).map((s, i) => {
    if (!s.name)
      throw new ContractError(`service #${i + 1} has no name`);
    if (!s.start)
      throw new ContractError(`service "${s.name}" has no start command`);
    return s;
  });
  if (services.length === 0)
    throw new ContractError("witness.toml declares no [[service]]");
  const suites = (doc.suite ?? []).map((s, i) => {
    if (!s.name || !s.cmd || !s.junit)
      throw new ContractError(`suite #${i + 1} needs name, cmd and junit`);
    return s;
  });
  if (suites.length === 0)
    throw new ContractError("witness.toml declares no [[suite]]");
  const surfaces = doc.surfaces ?? { api: { service: services[0].name } };
  for (const [k, v] of Object.entries(surfaces)) {
    if (!services.find((s) => s.name === v.service))
      throw new ContractError(`surface "${k}" points at unknown service "${v.service}"`);
  }
  const eqFile = path2.join(home, "equivalence.toml");
  const equivalence = parseEquivalence(fs2.existsSync(eqFile) ? fs2.readFileSync(eqFile, "utf8") : null);
  let origin = doc.origin;
  let originRaw = "";
  if (origin?.repo) {
    const repoPath = path2.resolve(root, origin.repo);
    if (!fs2.existsSync(repoPath))
      throw new ContractError(`origin.repo ${origin.repo} does not exist (resolved to ${repoPath})`);
    if (!origin.contract)
      throw new ContractError("origin.repo needs origin.contract: a toml file with the [[service]] entries that boot the origin");
    const oc = path2.resolve(root, origin.contract);
    originRaw = fs2.readFileSync(oc, "utf8");
    const odoc = parse(originRaw);
    const oservices = odoc.service ?? [];
    for (const surf of Object.values(surfaces))
      if (!oservices.find((x) => x.name === surf.service))
        throw new ContractError(`origin contract must define a service named "${surf.service}" (same as the target's surface)`);
    let routes = [];
    if (origin.map) {
      const mraw = fs2.readFileSync(path2.resolve(root, origin.map), "utf8");
      originRaw += mraw;
      routes = parse(mraw).route ?? [];
    }
    origin = { ...origin, services: oservices, routes, repoPath };
  }
  return {
    root,
    home,
    file,
    services,
    suites,
    surfaces,
    fixtures: doc.fixtures ?? {},
    origin,
    equivalence,
    raw: raw + originRaw
  };
}
function subst(s, vars) {
  return s.replace(/\$\{([\w.]+)\}/g, (m, k) => (k in vars) ? vars[k] : m);
}
var TEMPLATE = `# Witness contract: how to boot this app and run its boundary tests.
# Docs: VERIFY.md. Variables: \${PORT} (assigned per service), \${self.url}, \${CHECKOUT} (checkout being booted),
# \${WITNESS_HOME} (this folder in the head checkout).

[[service]]
name  = "api"
# setup = "bash \${WITNESS_HOME}/bin/build.sh"     # optional, runs before start, should be idempotent
start = "bash \${WITNESS_HOME}/bin/start.sh"        # long-running, must listen on $PORT
ready = { http = "\${self.url}/health", status = 200, timeout = "120s" }

[surfaces]
api = { service = "api" }        # tests receive WITNESS_API_URL pointing at a recording proxy for this service

[[suite]]
name  = "api"
cmd   = "bash \${WITNESS_HOME}/bin/test.sh"         # runs ONLY boundary tests; honours WITNESS_TESTS
junit = "target/surefire-reports/*.xml"             # JUnit XML, relative to the repo root

# [fixtures]
# reset = "..."                  # optional, runs before each suite invocation

# [origin]                       # High level compares with the base commit's app by default. For a migration:
# repo     = "../legacy-app"     # the origin checkout
# contract = ".witness/origin/witness.toml"   # [[service]] entries that boot it (same service names)
# map      = ".witness/origin/map.toml"       # [[route]] target = "/api/x", origin = "/x", prefix = true
`;

// engine/src/lint.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";
var SOURCE_EXT = /\.(java|kt|groovy|scala|ts|tsx|js|mjs|py|go|rb|cs|rs|php)$/;
var SKIP = /(node_modules|\/target\/|\/build\/|\/dist\/|\/\.git\/|\/\.witness\/(records|cache)\/)/;
function sourceFiles(root) {
  return fs3.globSync(path3.join(root, "**", "*")).filter((f) => SOURCE_EXT.test(f) && !SKIP.test(f));
}
function lint(contract, files) {
  const issues = [];
  const ids = new Map;
  let srcCache = null;
  const src = () => srcCache ??= sourceFiles(contract.root).map((f) => ({ file: f, text: fs3.readFileSync(f, "utf8") }));
  for (const f of files) {
    const rel = path3.relative(contract.root, f.file);
    if (!f.claims.length)
      issues.push({ level: "warning", message: `${rel} has no claims (expected lines like "- C1 [api] ...")`, where: rel });
    for (const c of f.claims) {
      const where = `${rel}:${c.line}`;
      if (ids.has(c.id))
        issues.push({ level: "error", message: `claim id ${c.id} is used twice (${ids.get(c.id)} and ${where})`, where });
      ids.set(c.id, where);
      if (c.retired)
        continue;
      if (!c.surfaces.length)
        issues.push({ level: "warning", message: `${c.id} names no surface (api, ui, cli)`, where });
      if (c.tags.includes("changed") && !c.expectDiff.length)
        issues.push({ level: "error", message: `${c.id} is tagged changed but has no "expect-diff:" line`, where });
      if (!c.proof && !c.tags.includes("judged"))
        issues.push({ level: "warning", message: `${c.id} has no proof: and is not judged, so it will be reported as not tested`, where });
      if (c.proof) {
        if (!c.proof.includes("#")) {
          issues.push({ level: "error", message: `${c.id} proof "${c.proof}" must look like Class#method`, where });
          continue;
        }
        const [cls, method] = c.proof.split("#");
        const hit = src().find((s) => path3.basename(s.file).startsWith(cls + ".") && new RegExp(`\\b${method}\\s*\\(`).test(s.text));
        if (!hit)
          issues.push({ level: "error", message: `${c.id} proof ${c.proof}: no test method "${method}" found in a file named ${cls}.*`, where });
        else if (!/witness/i.test(hit.text) && !/extends\s+\w*Witness\w*/.test(hit.text))
          issues.push({ level: "warning", message: `${c.id}: ${cls} doesn't appear to use the witness helper, so its exchanges won't be attributed`, where });
      }
    }
  }
  for (const s of contract.suites)
    if (s.junit.startsWith("/"))
      issues.push({ level: "warning", message: `suite ${s.name}: junit path should be relative to the repo root` });
  return issues;
}

// engine/src/record.ts
import * as fs5 from "node:fs";
import * as path5 from "node:path";
import { fileURLToPath } from "node:url";

// engine/src/verdict.ts
var STATUS_WORD = {
  proven: "proven",
  failed: "failed",
  cant_tell: "can't tell",
  overturned: "overturned",
  not_tested: "not tested",
  flaky: "flaky"
};
function assessClaim(c, facts) {
  const r = { ...c, status: "proven", reasons: [], bite: null };
  if (!c.proof) {
    if (c.tags.includes("judged")) {
      r.status = "cant_tell";
      r.reasons.push("Judged claim; awaiting the judge.");
    } else {
      r.status = "not_tested";
      r.reasons.push("No proof: test linked.");
    }
    return r;
  }
  const id = c.proof.includes("#") ? c.proof : c.proof;
  r.testId = id;
  const head = facts.head.get(id);
  r.head = head;
  if (!head) {
    r.status = "failed";
    r.reasons.push(`The proof test ${id} did not run. Check the class and method name, and that the suite includes it.`);
    return r;
  }
  if (head.status === "skipped") {
    r.status = "not_tested";
    r.reasons.push(`The proof test ${id} was skipped.`);
    return r;
  }
  if (head.status === "failed") {
    const again = facts.rerun?.get(id);
    r.rerun = again;
    if (again?.status === "passed") {
      r.status = "flaky";
      r.reasons.push(`Failed, then passed when retried once: ${failureHeadline(head.message)}. Treat as unreliable until it passes consistently.`);
    } else {
      r.status = "failed";
      r.reasons.push(`The proof test failed: ${failureHeadline(head.message)}`);
    }
  }
  if (r.status === "proven" && facts.observed === 0) {
    r.status = "cant_tell";
    r.reasons.push("The proof test passed but made no request to the app that witness could see, so it proves nothing about the app. Make it call the app through the witness helper (it sends the X-Witness-Test header).");
  }
  if (facts.base) {
    const base = facts.base.get(id);
    r.base = base;
    const expectPreserved = c.tags.includes("parity");
    const biteExempt = facts.migrate && c.tags.includes("changed");
    if (base && biteExempt)
      r.bite = null;
    else if (base) {
      if (expectPreserved) {
        r.bite = base.status === "passed" ? "preserved" : "not_on_base";
        if (base.status !== "passed")
          r.reasons.push("Tagged parity, but the test fails on the base app. Is this really existing behavior?");
      } else if (base.status === "passed") {
        r.bite = "vacuous";
        if (r.status === "proven") {
          r.status = "failed";
          r.reasons.push("The test also passes on the base app, so it doesn't prove this change (it doesn't bite).");
        }
      } else if (head.status === "passed")
        r.bite = "bites";
    }
  }
  if (facts.parity && r.status === "proven") {
    r.parity = facts.parity;
    if (facts.parity.status === "unexplained") {
      r.status = "failed";
      r.reasons.push(facts.parity.note ?? `Origin and target differ in ${facts.parity.diffs.length} place(s) that no rule or 'changed' claim explains.`);
    }
  } else if (facts.parity)
    r.parity = facts.parity;
  if (c.tags.includes("judged") && r.status === "proven") {
    r.status = "cant_tell";
    r.reasons.push("Judged claim; awaiting the judge.");
  }
  return r;
}
function applyJudge(r, j, kind) {
  r.judge = j;
  r.reasons = r.reasons.filter((x) => !x.includes("awaiting the judge"));
  if (kind === "parity") {
    if (j.accepted === "overturned") {
      r.status = "overturned";
      r.reasons.push(`Overturned by the judge: ${j.note}`);
    } else
      r.reasons.push(`The judge upheld the failure: ${j.note}`);
    return;
  }
  if (j.accepted === "pass")
    r.status = r.status === "cant_tell" ? "proven" : r.status;
  else if (j.accepted === "fail")
    r.status = "failed";
  else
    r.status = "cant_tell";
  r.reasons.push(`Judge: ${j.note}`);
}
function overall(claims, regressions, extraProblems = 0) {
  if (!claims.filter((c) => !c.synthetic).length)
    return claims.some((c) => c.status === "failed") || regressions.length ? "needs_a_look" : "unproven";
  if (extraProblems)
    return "needs_a_look";
  const bad = claims.some((c) => c.status !== "proven" && c.status !== "overturned" && c.status !== "not_tested");
  return bad || regressions.length ? "needs_a_look" : "proven";
}
function counts(claims) {
  const k = { proven: 0, failed: 0, cant_tell: 0, overturned: 0, not_tested: 0, flaky: 0 };
  for (const c of claims)
    k[c.status]++;
  return k;
}
function failureHeadline(msg) {
  const lines = (msg ?? "").split(`
`).map((l) => l.trim()).filter(Boolean);
  if (!lines.length)
    return "no message";
  const picked = [lines[0], ...lines.slice(1, 12).filter((l) => /expected|actual|but was|doesn't match|does not match/i.test(l))];
  return [...new Set(picked)].slice(0, 4).join(" · ").slice(0, 400);
}
var firstLine = (s) => (s ?? "").split(`
`).find((l) => l.trim())?.trim().slice(0, 300) ?? "no message";

// engine/src/util.ts
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs4 from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path4 from "node:path";
var sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
function hashFiles(files) {
  const h = createHash("sha256");
  for (const f of [...files].sort()) {
    h.update(f);
    if (fs4.existsSync(f))
      h.update(fs4.readFileSync(f));
  }
  return h.digest("hex").slice(0, 16);
}
function freePort() {
  return new Promise((resolve2, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve2(port));
    });
  });
}
function git(cwd, args, env = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}
function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}
function worktreeHash(repo, exclude = []) {
  const idx = path4.join(os.tmpdir(), `witness-idx-${process.pid}-${Date.now()}`);
  try {
    const env = { GIT_INDEX_FILE: idx };
    git(repo, ["read-tree", "HEAD"], env);
    const gi = path4.join(repo, ".witness", ".gitignore");
    if (fs4.existsSync(path4.dirname(gi)) && !fs4.existsSync(gi))
      fs4.writeFileSync(gi, `records/
cache/
`);
    git(repo, ["add", "-A", "--", "."], env);
    if (exclude.length)
      git(repo, ["rm", "-r", "--cached", "-q", "--ignore-unmatch", "--", ...exclude], env);
    return git(repo, ["write-tree"], env).slice(0, 16);
  } finally {
    fs4.rmSync(idx, { force: true });
  }
}
function runShell(cmd, opts) {
  return new Promise((resolve2) => {
    const t0 = Date.now();
    fs4.mkdirSync(path4.dirname(opts.log), { recursive: true });
    const out = fs4.openSync(opts.log, "a");
    fs4.writeSync(out, `
$ ${cmd}
`);
    const child = spawn("bash", ["-c", cmd], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", out, out],
      detached: true
    });
    let timer;
    if (opts.timeoutMs)
      timer = setTimeout(() => killTree(child), opts.timeoutMs);
    child.on("exit", (code) => {
      if (timer)
        clearTimeout(timer);
      fs4.closeSync(out);
      resolve2({ code: code ?? 1, ms: Date.now() - t0 });
    });
  });
}
function startShell(cmd, opts) {
  fs4.mkdirSync(path4.dirname(opts.log), { recursive: true });
  const out = fs4.openSync(opts.log, "a");
  fs4.writeSync(out, `
$ ${cmd}
`);
  const child = spawn("bash", ["-c", cmd], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", out, out],
    detached: true
  });
  child.on("exit", () => fs4.closeSync(out));
  return child;
}
function killTree(child, signal = "SIGTERM") {
  if (child.pid == null || child.exitCode != null)
    return;
  try {
    process.kill(-child.pid, signal);
  } catch {}
}
function tail(file, lines = 30) {
  if (!fs4.existsSync(file))
    return "";
  const all = fs4.readFileSync(file, "utf8").split(`
`);
  return all.slice(-lines).join(`
`);
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fmtMs(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
function parseDuration(s, dflt) {
  if (s == null)
    return dflt;
  if (typeof s === "number")
    return s * 1000;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(s.trim());
  if (!m)
    return dflt;
  const n = Number(m[1]);
  return m[2] === "ms" ? n : m[2] === "m" ? n * 60000 : n * 1000;
}
function readJson(file, dflt) {
  try {
    return JSON.parse(fs4.readFileSync(file, "utf8"));
  } catch {
    return dflt;
  }
}
function writeJson(file, data) {
  fs4.mkdirSync(path4.dirname(file), { recursive: true });
  fs4.writeFileSync(file, JSON.stringify(data, null, 2));
}
var useColor = process.stdout.isTTY && !process.env.NO_COLOR;
var c = (code) => (s) => useColor ? `\x1B[${code}m${s}\x1B[0m` : s;
var color = { dim: c("2"), bold: c("1"), red: c("31"), green: c("32"), yellow: c("33"), blue: c("34") };
function say(phase, msg) {
  process.stderr.write(`${color.dim(phase.padStart(18))} ${color.dim("·")} ${msg}
`);
}

// engine/src/record.ts
var here = path5.dirname(fileURLToPath(import.meta.url));
var VERDICT_WORD = { proven: "Proven", needs_a_look: "Needs a look", unproven: "Nothing proven", mistrial: "Mistrial" };
var short = (s) => (s ?? "").slice(0, 7);
function writeRecord(dir, b) {
  fs5.mkdirSync(dir, { recursive: true });
  fs5.writeFileSync(path5.join(dir, "bundle.json"), JSON.stringify(b, null, 2));
  fs5.writeFileSync(path5.join(dir, "agent.md"), agentDigest(b, dir));
  fs5.writeFileSync(path5.join(dir, "pr.md"), prComment(b));
  const tpl = fs5.readFileSync(path5.join(here, "viewer", "index.html"), "utf8");
  const data = JSON.stringify(b).replace(/</g, "\\u003c");
  fs5.writeFileSync(path5.join(dir, "index.html"), tpl.replace("/*__WITNESS_DATA__*/null", data));
  const latest = path5.join(path5.dirname(dir), "latest");
  try {
    fs5.rmSync(latest, { force: true });
    fs5.symlinkSync(path5.basename(dir), latest);
  } catch {}
}
function countLine(b) {
  const k = b.counts;
  const parts = [
    k.proven && `${k.proven} proven`,
    k.failed && `${k.failed} failed`,
    k.flaky && `${k.flaky} flaky`,
    k.cant_tell && `${k.cant_tell} can't tell`,
    k.overturned && `${k.overturned} overturned`,
    k.not_tested && `${k.not_tested} not tested`
  ].filter(Boolean);
  return parts.join(" · ") || "no claims";
}
function biteLine(b) {
  const bites = b.claims.filter((c2) => c2.bite === "bites").length;
  const vac = b.claims.filter((c2) => c2.bite === "vacuous").length;
  if (!b.base || bites + vac === 0)
    return null;
  return `Bite check: ${bites} of ${bites + vac} new test(s) fail on ${b.base.ref}@${short(b.base.sha)} and pass with this change${vac ? ` · ${vac} also pass${vac === 1 ? "es" : ""} without it (doesn't bite)` : ""}`;
}
function otherLine(b) {
  const others = b.otherTests.length;
  if (!others)
    return null;
  return `Existing boundary tests: ${b.otherTests.filter((t) => t.status === "passed").length} of ${others} pass${b.regressions.length ? ` · ${b.regressions.length} regression(s)` : ""}`;
}
function declarationLines(b) {
  const d = b.declarations;
  if (!d)
    return [];
  const out = [];
  if (d.added.length)
    out.push(`New claims: ${d.added.join(", ")}`);
  if (d.changed.length)
    out.push(`Claims edited: ${d.changed.join(", ")}`);
  if (d.retired.length)
    out.push(`Claims retired: ${d.retired.join(", ")}`);
  if (d.removed.length)
    out.push(`Claims deleted without a reason: ${d.removed.join(", ")}`);
  for (const l of d.rules.added)
    out.push(`Rule added in equivalence.toml: ${l}`);
  for (const l of d.rules.removed)
    out.push(`Rule removed from equivalence.toml: ${l}`);
  const declared = b.claims.filter((c2) => c2.tags.includes("changed") && (d.added.includes(c2.id) || d.changed.includes(c2.id)));
  for (const c2 of declared)
    out.push(`Declared difference from the origin (${c2.id}): ${c2.expectDiff.join(", ")}`);
  return out;
}
function summaryLines(b) {
  if (b.verdict === "mistrial")
    return [`Mistrial: ${b.mistrial?.message}`, `Remedy: ${b.mistrial?.remedy}`];
  if (b.verdict === "unproven")
    return ["Nothing proven: no claims cover this change.", "Add claims in .witness/claims/ (the /witness:claims skill helps), then run witness verify again."];
  const out = [`${VERDICT_WORD[b.verdict]} · ${countLine(b)} · level ${b.level} · ${fmtMs(b.ms)}`];
  for (const l of [biteLine(b), otherLine(b)])
    if (l)
      out.push(l);
  const dl = declarationLines(b);
  if (dl.length)
    out.push(`Changed in this PR (a reviewer should approve): ${dl.join(" · ")}`);
  for (const c2 of b.claims.filter((c3) => c3.status !== "proven"))
    out.push(`  ${STATUS_WORD[c2.status].padEnd(11)} ${c2.id} ${c2.text}`);
  for (const t of b.regressions)
    out.push(`  regression  ${t.id}: ${firstLine(t.message)}`);
  return out;
}
function exchangesFor(b, c2, side) {
  return b.exchanges.filter((e) => e.test === c2.testId && e.side === side && e.run === "primary");
}
function agentDigest(b, dir) {
  const L = [`# Witness verdict: ${VERDICT_WORD[b.verdict]}`, ""];
  if (b.verdict === "mistrial") {
    L.push(`The app or the claims could not be put on trial: ${b.mistrial?.message}`, "", `Remedy: ${b.mistrial?.remedy}`, "");
    if (b.mistrial?.logTail)
      L.push("Log tail:", "```", b.mistrial.logTail.slice(-3000), "```");
    L.push("", `Logs: ${path5.join(dir, "logs")}`);
    return L.join(`
`);
  }
  if (b.verdict === "unproven") {
    L.push(...summaryLines(b));
    return L.join(`
`);
  }
  L.push(summaryLines(b)[0], biteLine(b) ?? "", otherLine(b) ?? "", "");
  const dl = declarationLines(b);
  if (dl.length)
    L.push("Changed in this PR (tell the user; a reviewer must approve these):", ...dl.map((x) => `- ${x}`), "");
  const bad = b.claims.filter((c2) => c2.status !== "proven" && c2.status !== "overturned");
  if (!bad.length && !b.regressions.length)
    L.push("All claims hold. Nothing to fix.");
  for (const c2 of bad) {
    L.push(`## ${c2.id} · ${STATUS_WORD[c2.status]} · ${c2.text}`, `Claim: ${path5.basename(c2.file)}:${c2.line}${c2.testId ? ` · test ${c2.testId}${c2.source ? ` (${c2.source.file}:${c2.source.line})` : ""}` : ""}`);
    for (const r of c2.reasons)
      L.push(`- ${r}`);
    if (c2.head?.message)
      L.push("", "Failure:", "```", c2.head.message.split(`
`).slice(0, 12).join(`
`), "```");
    const ex = exchangesFor(b, c2, "head").slice(-3);
    if (ex.length) {
      L.push("", "Last exchanges on this branch:");
      for (const e of ex)
        L.push(`- ${e.method} ${e.path} -> ${e.status} ${e.resBody.slice(0, 300).replace(/\n/g, " ")}`);
    }
    if (c2.parity?.diffs.length) {
      L.push("", "Origin vs target differences:");
      for (const d of c2.parity.diffs.slice(0, 10))
        L.push(`- ${d.field}: origin ${d.origin} -> target ${d.target}`);
    }
    if (c2.judge?.suggested_claim)
      L.push("", `Judge suggests the claim: ${c2.judge.suggested_claim}`);
    L.push("");
  }
  for (const t of b.regressions)
    L.push(`## Regression · ${t.id}`, "```", (t.message ?? "").split(`
`).slice(0, 10).join(`
`), "```", "");
  if (b.warnings.length)
    L.push("Warnings:", ...b.warnings.map((w) => `- ${w}`), "");
  L.push("Rules: fix the code or the test so the claim holds. Do not weaken or delete a claim to make it pass without telling the user;", "if a claim is wrong, say so and propose the change.", "", `Full record: ${path5.join(dir, "index.html")}`);
  return L.join(`
`);
}
function prComment(b) {
  const icon = b.verdict === "proven" ? "\uD83D\uDFE2" : b.verdict === "mistrial" || b.verdict === "unproven" ? "⚪" : "\uD83D\uDD34";
  const L = [`### ${icon} witness · ${VERDICT_WORD[b.verdict]}`, ""];
  if (b.verdict === "mistrial") {
    L.push(`The app could not be verified: ${b.mistrial?.message}`, "", `**Remedy:** ${b.mistrial?.remedy}`);
    return L.join(`
`);
  }
  if (b.verdict === "unproven") {
    L.push("No claims cover this change, so nothing was verified.");
    return L.join(`
`);
  }
  L.push(`**${countLine(b)}** · level ${b.level} · ${fmtMs(b.ms)}`, "");
  for (const l of [biteLine(b), otherLine(b)])
    if (l)
      L.push(`- ${l}`);
  const dl = declarationLines(b);
  if (dl.length)
    L.push("", "**Changed in this PR — please review:**", ...dl.map((x) => `- ${x}`), "");
  for (const c2 of b.claims.filter((c3) => c3.status === "failed" || c3.status === "flaky"))
    L.push(`- **${STATUS_WORD[c2.status]}:** ${c2.text} (${c2.id}) — ${c2.reasons[0] ?? ""}`);
  for (const c2 of b.claims.filter((c3) => c3.status === "cant_tell"))
    L.push(`- **Can't tell:** ${c2.text} (${c2.id})${c2.judge ? ` — ${c2.judge.note}` : ""}`);
  for (const c2 of b.claims.filter((c3) => c3.status === "overturned"))
    L.push(`- **Overturned:** ${c2.text} (${c2.id}) — judge cited ${(() => {
      const s = c2.judge?.citations.find((x) => x.verified)?.source;
      const src = b.sources.find((x) => x.name === s);
      return src?.path ? `${s} (passed with --source: ${src.path})` : s;
    })()}: “${c2.judge?.citations.find((x) => x.verified)?.quote}”`);
  for (const c2 of b.claims.filter((c3) => c3.status === "not_tested"))
    L.push(`- **Not tested:** ${c2.text} (${c2.id})`);
  for (const t of b.regressions)
    L.push(`- **Regression:** ${t.id}`);
  L.push("", "<details><summary>Claims</summary>", "", "| | Claim | Proof |", "|---|---|---|");
  for (const c2 of b.claims)
    L.push(`| ${STATUS_WORD[c2.status]} | ${c2.id} ${c2.text} | ${c2.testId ?? "judged"}${c2.bite === "bites" ? " · bites" : ""} |`);
  L.push("", "</details>", "", `<sub>head ${short(b.head.sha)}${b.head.dirty ? "+dirty" : ""}${b.base ? ` · base ${b.base.ref}@${short(b.base.sha)}` : ""} · reproduce: \`witness verify${b.level === "high" ? " --level high" : ""}\`</sub>`);
  return L.join(`
`);
}

// engine/src/session.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";

// engine/src/junit.ts
var import_fast_xml_parser = __toESM(require_fxp(), 1);
var parser = new import_fast_xml_parser.XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "#text", htmlEntities: true, processEntities: true });
var decode = (s) => s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));
var arr = (x) => x == null ? [] : Array.isArray(x) ? x : [x];
function text(node) {
  if (node == null)
    return "";
  if (typeof node === "string")
    return node;
  const n = node;
  const body = typeof n["#text"] === "string" ? n["#text"] : "";
  const msg = typeof n.message === "string" ? decode(n.message) : "";
  return decode(body || msg).trim();
}
function parseJUnit(xml) {
  const doc = parser.parse(xml);
  const suites = [...arr(doc.testsuites?.testsuite), ...arr(doc.testsuite)];
  const out = [];
  const walk = (suite) => {
    for (const tc of arr(suite.testcase)) {
      const classname = String(tc.classname ?? suite.name ?? "");
      const name = String(tc.name ?? "");
      const failure = tc.failure ?? tc.error;
      const skipped = tc.skipped !== undefined;
      out.push({
        id: normalizeTestId(`${classname}#${name}`),
        classname,
        name,
        status: failure !== undefined ? "failed" : skipped ? "skipped" : "passed",
        message: failure !== undefined ? text(Array.isArray(failure) ? failure[0] : failure).slice(0, 4000) : undefined,
        ms: Math.round(Number(tc.time ?? 0) * 1000)
      });
    }
    for (const s of arr(suite.testsuite))
      walk(s);
  };
  suites.forEach(walk);
  return out;
}

// engine/src/proxy.ts
import * as http from "node:http";
import * as zlib from "node:zlib";
var TEST_HEADER = "x-witness-test";
var MAX_BODY = 64 * 1024;
var KEEP_HEADERS = new Set(["content-type", "location", "accept", "authorization", "content-length"]);
function pickHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h))
    if (KEEP_HEADERS.has(k) && v != null)
      out[k] = Array.isArray(v) ? v.join(", ") : v;
  if (out.authorization)
    out.authorization = "[redacted]";
  return out;
}
function decode2(b, encoding) {
  const enc = String(encoding ?? "").toLowerCase();
  try {
    if (enc.includes("gzip"))
      return zlib.gunzipSync(b);
    if (enc.includes("br"))
      return zlib.brotliDecompressSync(b);
    if (enc.includes("deflate"))
      return zlib.inflateSync(b);
  } catch {}
  return b;
}
var clip = (b) => b.length > MAX_BODY ? b.subarray(0, MAX_BODY).toString("utf8") : b.toString("utf8");

class RecordingProxy {
  exchanges = [];
  run = "primary";
  server;
  seq = 0;
  port = 0;
  target;
  side;
  rewrite;
  constructor(target, side, rewrite = (u) => u) {
    this.target = target;
    this.side = side;
    this.rewrite = rewrite;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }
  listen(host = "127.0.0.1") {
    return new Promise((resolve2) => {
      this.server.listen(0, host, () => {
        this.port = this.server.address().port;
        resolve2(this.port);
      });
    });
  }
  close() {
    return new Promise((r) => {
      this.server.closeAllConnections?.();
      this.server.close(() => r());
    });
  }
  handle(req, res) {
    const chunks = [];
    req.on("data", (c2) => chunks.push(c2));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const t0 = Date.now();
      const testHeader = req.headers[TEST_HEADER];
      const test = (Array.isArray(testHeader) ? testHeader[0] : testHeader) ?? null;
      const headers = { ...req.headers };
      delete headers[TEST_HEADER];
      headers.host = `${this.target.host}:${this.target.port}`;
      const ex = {
        seq: ++this.seq,
        side: this.side,
        run: this.run,
        test,
        ts: t0,
        ms: 0,
        method: req.method ?? "GET",
        path: req.url ?? "/",
        reqHeaders: pickHeaders(req.headers),
        reqBody: clip(body),
        status: 0,
        resHeaders: {},
        resBody: ""
      };
      const upstreamPath = this.rewrite(req.url ?? "/");
      if (upstreamPath !== req.url)
        ex.upstreamPath = upstreamPath;
      const up = http.request({ host: this.target.host, port: this.target.port, method: req.method, path: upstreamPath, headers }, (upRes) => {
        const out = [];
        upRes.on("data", (c2) => out.push(c2));
        upRes.on("end", () => {
          const resBody = Buffer.concat(out);
          ex.status = upRes.statusCode ?? 0;
          ex.resHeaders = pickHeaders(upRes.headers);
          ex.resBody = clip(decode2(resBody, upRes.headers["content-encoding"]));
          ex.truncated = resBody.length > MAX_BODY || body.length > MAX_BODY;
          ex.ms = Date.now() - t0;
          this.exchanges.push(ex);
          res.writeHead(upRes.statusCode ?? 502, upRes.headers);
          res.end(resBody);
        });
      });
      up.on("error", (e) => {
        ex.status = 502;
        ex.error = e.message;
        ex.ms = Date.now() - t0;
        this.exchanges.push(ex);
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`witness proxy: upstream error: ${e.message}`);
      });
      up.end(body);
    });
  }
}

// engine/src/session.ts
var cleanups = new Set;
function registerCleanup(fn) {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}
async function runCleanups() {
  for (const fn of [...cleanups].reverse()) {
    try {
      await fn();
    } catch {}
  }
  cleanups.clear();
}

class Mistrial extends Error {
  remedy;
  logTail;
  constructor(msg, remedy, logTail = "") {
    super(msg);
    this.remedy = remedy;
    this.logTail = logTail;
  }
}

class Side {
  running = [];
  bootMs = 0;
  name;
  contract;
  checkout;
  logDir;
  services;
  rewrite;
  constructor(name, contract, checkout, logDir, opts = {}) {
    this.name = name;
    this.contract = contract;
    this.checkout = checkout;
    this.logDir = logDir;
    this.services = opts.services ?? contract.services;
    this.rewrite = opts.rewrite;
  }
  vars(svc, port) {
    const v = {
      PORT: String(port),
      CHECKOUT: this.checkout,
      WITNESS_HOME: this.contract.home,
      WITNESS_SIDE: this.name,
      "self.url": `http://127.0.0.1:${port}`
    };
    for (const r of this.running)
      v[`${r.svc.name}.url`] = `http://127.0.0.1:${r.port}`;
    return v;
  }
  unregister;
  async boot() {
    const t0 = Date.now();
    this.unregister = registerCleanup(() => this.shutdown());
    for (const svc of this.services) {
      const port = await freePort();
      const vars = this.vars(svc, port);
      const env = { ...vars, ...Object.fromEntries(Object.entries(svc.env ?? {}).map(([k, v]) => [k, subst(v, vars)])) };
      delete env["self.url"];
      const log = path6.join(this.logDir, `${this.name}-${svc.name}.log`);
      if (svc.setup) {
        say("calling witnesses", `${this.name}/${svc.name}: setup`);
        const r = await runShell(subst(svc.setup, vars), { cwd: this.checkout, env, log, timeoutMs: 20 * 60000 });
        if (r.code !== 0)
          throw new Mistrial(`${this.name}/${svc.name} setup failed (exit ${r.code})`, `Fix the setup command in witness.toml, or run it by hand in ${this.checkout}.`, tail(log));
      }
      say("calling witnesses", `${this.name}/${svc.name}: starting on :${port}`);
      const child = startShell(subst(svc.start, vars), { cwd: this.checkout, env, log });
      const run = { svc, port, child };
      this.running.push(run);
      await this.waitReady(run, vars, log);
    }
    for (const [surface, s] of Object.entries(this.contract.surfaces)) {
      const run = this.running.find((r) => r.svc.name === s.service);
      run.proxy = new RecordingProxy({ host: "127.0.0.1", port: run.port }, this.name, this.rewrite);
      await run.proxy.listen();
      say("calling witnesses", `${this.name}: surface ${surface} recorded via :${run.proxy.port}`);
    }
    this.bootMs = Date.now() - t0;
  }
  async waitReady(run, vars, log) {
    const ready = run.svc.ready;
    const timeout = parseDuration(ready?.timeout, 120000);
    const url = ready ? subst(ready.http, vars) : vars["self.url"];
    const want = ready?.status;
    const t0 = Date.now();
    let exited = null;
    run.child.on("exit", (c2) => exited = c2 ?? 1);
    let last = "";
    while (Date.now() - t0 < timeout) {
      if (exited !== null)
        throw new Mistrial(`${this.name}/${run.svc.name} exited (code ${exited}) before it was ready`, `Check the start command; it must stay in the foreground and listen on $PORT.`, tail(log));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (want ? res.status === want : res.status < 500) {
          say("calling witnesses", `${this.name}/${run.svc.name}: ready in ${fmtMs(Date.now() - t0)}`);
          return;
        }
        last = `HTTP ${res.status}`;
      } catch (e) {
        last = e.message;
      }
      await sleep(1000);
    }
    throw new Mistrial(`${this.name}/${run.svc.name} never became ready at ${url} within ${fmtMs(timeout)} (last: ${last})`, `Raise ready.timeout or fix ready.http in witness.toml.`, tail(log));
  }
  surfaceEnv() {
    const env = {};
    for (const [surface, s] of Object.entries(this.contract.surfaces)) {
      const run = this.running.find((r) => r.svc.name === s.service);
      env[`WITNESS_${surface.toUpperCase()}_URL`] = `http://localhost:${run.proxy.port}`;
    }
    return env;
  }
  exchanges() {
    return this.running.flatMap((r) => r.proxy?.exchanges ?? []);
  }
  setRun(label) {
    for (const r of this.running)
      if (r.proxy)
        r.proxy.run = label;
  }
  async shutdown() {
    for (const r of [...this.running].reverse()) {
      await r.proxy?.close();
      killTree(r.child, "SIGTERM");
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && this.running.some((r) => r.child.exitCode === null && r.child.signalCode === null))
      await sleep(200);
    for (const r of this.running)
      killTree(r.child, "SIGKILL");
    this.running = [];
    this.unregister?.();
  }
}
async function runSuites(contract, side, opts) {
  const out = [];
  side.setRun(opts.run ?? "primary");
  for (const suite of contract.suites) {
    if (contract.fixtures.reset) {
      await runShell(contract.fixtures.reset, { cwd: side.checkout, env: { CHECKOUT: side.checkout, WITNESS_HOME: contract.home }, log: path6.join(opts.logDir, `${side.name}-reset.log`) });
    }
    const pattern = path6.join(contract.root, suite.junit);
    for (const f of fs6.globSync(pattern))
      fs6.rmSync(f, { force: true });
    const log = path6.join(opts.logDir, `${side.name}-suite-${suite.name}${opts.run && opts.run !== "primary" ? "-" + opts.run : ""}.log`);
    const env = { ...side.surfaceEnv(), WITNESS_HOME: contract.home, WITNESS_SIDE: side.name, CHECKOUT: contract.root };
    if (opts.only?.length)
      env.WITNESS_TESTS = opts.only.join(",");
    say("testimony", `${side.name}: suite ${suite.name}${opts.only ? ` (${opts.only.length} tests)` : ""}`);
    const r = await runShell(subst(suite.cmd, { WITNESS_HOME: contract.home, CHECKOUT: contract.root }), {
      cwd: contract.root,
      env,
      log,
      timeoutMs: parseDuration(suite.timeout, 15 * 60000)
    });
    const results = fs6.globSync(pattern).flatMap((f) => parseJUnit(fs6.readFileSync(f, "utf8")));
    say("testimony", `${side.name}: ${results.filter((t) => t.status === "passed").length}/${results.length} passed in ${fmtMs(r.ms)}`);
    out.push({ suite: suite.name, side: side.name, run: opts.run ?? "primary", code: r.code, ms: r.ms, results, log });
  }
  return out;
}

// engine/src/verify.ts
import * as fs8 from "node:fs";
import * as os3 from "node:os";
import * as path8 from "node:path";

// engine/src/judge.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import * as fs7 from "node:fs";
import * as os2 from "node:os";
import * as path7 from "node:path";
import { createHash as createHash2 } from "node:crypto";
var SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "fail", "cant_tell", "overturn"] },
    note: { type: "string", description: "One or two plain sentences for a code reviewer." },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: { source: { type: "string" }, quote: { type: "string" } },
        required: ["source", "quote"]
      }
    },
    suggested_claim: { type: "string", description: "A sharper claim that would make this assertable, if useful." }
  },
  required: ["verdict", "note", "citations"]
};
var SYSTEM = `You are the judge in a verification tool. You rule on ONE item using ONLY the evidence and sources given.
Rules:
- Cite evidence for every ruling: quote exchange lines (source "evidence") or source documents (use the source's exact name).
- "cant_tell" is a correct answer when the evidence does not settle it. Never guess.
- You never see the author's reasoning and must not assume intent beyond the sources.
- "overturn" is only allowed for a PARITY FAILURE, and only when a quote from a source marked [may justify overturn] explicitly justifies the difference. Quote it verbatim (at least 30 characters). Otherwise answer "fail" or "cant_tell".
- If the claim, the change description and the behavior disagree or something is ambiguous, say so in the note and propose suggested_claim.
Respond with the JSON object only.`;
var norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
function verifyQuote(quote, sources, sourceName) {
  const q = norm(quote);
  if (q.length < 30)
    return false;
  const src = sources.find((s) => s.name === sourceName && s.canOverturn);
  return !!src && norm(src.text).includes(q);
}
function judge(item, sources, cacheDir) {
  const t0 = Date.now();
  const key = createHash2("sha256").update(JSON.stringify([SYSTEM, item, sources, process.env.WITNESS_JUDGE_MODEL ?? ""])).digest("hex").slice(0, 16);
  const cached = cacheDir ? path7.join(cacheDir, `${key}.json`) : null;
  if (cached && fs7.existsSync(cached))
    return { ...JSON.parse(fs7.readFileSync(cached, "utf8")), cached: true, ms: 0 };
  const res = judgeOnce(item, sources, t0);
  if (cached && !res.error) {
    fs7.mkdirSync(cacheDir, { recursive: true });
    fs7.writeFileSync(cached, JSON.stringify(res));
  }
  return res;
}
function judgeOnce(item, sources, t0) {
  const srcText = sources.map((s) => `<source name="${s.name}"${s.canOverturn ? " [may justify overturn]" : ""}>
${s.text.slice(0, 12000)}
</source>`).join(`

`);
  const prompt = `ITEM KIND: ${item.kind === "parity" ? "PARITY FAILURE (origin vs target differ in a way no rule explains)" : "JUDGED CLAIM (cannot be asserted mechanically)"}
CLAIM: ${item.claim}
QUESTION: ${item.question}

EVIDENCE:
${item.evidence.slice(0, 20000)}

SOURCES:
${srcText || "(none)"}`;
  const call = callClaude(SYSTEM, prompt, SCHEMA);
  const ms = Date.now() - t0;
  const fail = (error) => ({ verdict: "cant_tell", note: "The judge could not rule.", citations: [], accepted: "cant_tell", error, ms });
  if (call.error)
    return fail(call.error);
  const parsed = call.parsed;
  if (!parsed?.verdict)
    return fail("judge returned no verdict");
  const res = {
    verdict: parsed.verdict,
    note: parsed.note ?? "",
    citations: (parsed.citations ?? []).map((c2) => ({ ...c2 })),
    suggested_claim: parsed.suggested_claim || undefined,
    accepted: "cant_tell",
    ms
  };
  for (const c2 of res.citations)
    c2.verified = c2.source === "evidence" ? norm(item.evidence).includes(norm(c2.quote)) : verifyQuote(c2.quote, sources, c2.source) || norm(sources.find((s) => s.name === c2.source)?.text ?? "").includes(norm(c2.quote));
  if (res.verdict === "overturn") {
    const ok = item.kind === "parity" && res.citations.some((c2) => verifyQuote(c2.quote, sources, c2.source));
    if (ok)
      res.accepted = "overturned";
    else {
      res.accepted = "fail";
      res.rejectedOverturn = item.kind !== "parity" ? "Overturn is only allowed for parity failures." : "No verbatim quote of 30+ characters from a source that can justify an overturn (base-revision VERIFY.md or .witness/sources, or an external --source file).";
    }
  } else
    res.accepted = res.verdict;
  return res;
}
function callClaude(system, prompt, schema) {
  const model = process.env.WITNESS_JUDGE_MODEL || "sonnet";
  const r = spawnSync2(process.env.WITNESS_CLAUDE_BIN || "claude", ["-p", "--model", model, "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "", "--system-prompt", system, "--json-schema", JSON.stringify(schema), "--output-format", "json"], { input: prompt, encoding: "utf8", cwd: os2.tmpdir(), timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0)
    return { error: (r.stderr || r.stdout || "claude exited non-zero").slice(0, 500) };
  try {
    const outer = JSON.parse(r.stdout);
    return { parsed: outer.structured_output ?? (typeof outer.result === "string" ? JSON.parse(outer.result.replace(/^```json\s*|```\s*$/g, "")) : outer.result) };
  } catch (e) {
    return { error: `unparseable judge output: ${e.message}` };
  }
}
var COVERAGE_SYSTEM = `You check whether a change's claims cover what was asked. You get the request (issue text) and the list of claims.
List each concrete, testable requirement in the request that NO claim covers. Quote the request text for each. Ignore requirements that are covered,
vague wishes, and implementation details. If everything is covered, return an empty list. Respond with the JSON object only.`;
var COVERAGE_SCHEMA = {
  type: "object",
  properties: {
    uncovered: {
      type: "array",
      items: { type: "object", properties: { requirement: { type: "string" }, quote: { type: "string" } }, required: ["requirement", "quote"] }
    },
    note: { type: "string" }
  },
  required: ["uncovered", "note"]
};
function coverage(request2, claimsList, cacheDir) {
  const prompt = `REQUEST:
${request2.slice(0, 15000)}

CLAIMS:
${claimsList}`;
  const key = createHash2("sha256").update(JSON.stringify([COVERAGE_SYSTEM, prompt, process.env.WITNESS_JUDGE_MODEL ?? ""])).digest("hex").slice(0, 16);
  const cached = cacheDir ? path7.join(cacheDir, `cov-${key}.json`) : null;
  if (cached && fs7.existsSync(cached))
    return { ...JSON.parse(fs7.readFileSync(cached, "utf8")), cached: true };
  const call = callClaude(COVERAGE_SYSTEM, prompt, COVERAGE_SCHEMA);
  if (call.error || !call.parsed)
    return { uncovered: [], note: "", error: call.error ?? "no answer" };
  const n = (x) => x.replace(/\s+/g, " ").trim().toLowerCase();
  const res = { uncovered: (call.parsed.uncovered ?? []).filter((u) => u.quote && n(request2).includes(n(u.quote))), note: call.parsed.note ?? "" };
  if (cached) {
    fs7.mkdirSync(cacheDir, { recursive: true });
    fs7.writeFileSync(cached, JSON.stringify(res));
  }
  return res;
}

// engine/src/parity.ts
function globToRegex(p) {
  const esc = p.replace(/^\$\.?/, "").replace(/[.+?^${}()|\\]/g, "\\$&").replace(/\\\.\*\*\\\./g, "(?:\\.|.*\\.)").replace(/\*\*/g, ".*").replace(/\[\*\]/g, "\\[\\d+\\]").replace(/(?<!\.)\*/g, "[^.\\[]*");
  return new RegExp(`^${esc}$`);
}
function pathMatches(pathStr, pattern) {
  const p = pattern.replace(/^\$\.?/, "");
  const s = pathStr.replace(/^\$\.?/, "");
  if (s === p || s.startsWith(p + ".") || s.startsWith(p + "["))
    return true;
  if (p.startsWith("**.")) {
    const leaf = p.slice(3);
    if (s === leaf || s.endsWith("." + leaf) || globToRegex("**." + leaf).test(s))
      return true;
  }
  return globToRegex(p).test(s);
}
function stable(v) {
  return JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
}
function normalize(v, at, eq) {
  if (Array.isArray(v)) {
    const items = v.map((x, i) => normalize(x, `${at}[${i}]`, eq));
    const generic = `${at}[*]`;
    if (eq.unordered.some((u) => pathMatches(generic, u) || pathMatches(at, u)))
      items.sort((a, b) => stable(a).localeCompare(stable(b)));
    return items;
  }
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const p = at ? `${at}.${k}` : k;
      if (eq.ignore_fields.some((f) => pathMatches(p, f)))
        continue;
      out[k] = normalize(x, p, eq);
    }
    return out;
  }
  return v;
}
function deepDiff(a, b, at, out, allowAdded = false) {
  if (out.length > 50)
    return;
  const show = (x) => x === undefined ? "(absent)" : JSON.stringify(x)?.slice(0, 200) ?? String(x);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length && a.length > 1 && stable(a) !== stable(b)) {
      const sa = a.map(stable).sort().join("\x00");
      const sb = b.map(stable).sort().join("\x00");
      if (sa === sb) {
        out.push({ field: `${at}[order]`, origin: `${a.length} items`, target: `same ${b.length} items, different order` });
        return;
      }
    }
    if (a.length !== b.length)
      out.push({ field: `${at}.length`, origin: String(a.length), target: String(b.length) });
    for (let i = 0;i < Math.min(a.length, b.length); i++)
      deepDiff(a[i], b[i], `${at}[${i}]`, out, allowAdded);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      if (allowAdded && !(k in a))
        continue;
      deepDiff(a[k], b[k], `${at}.${k}`, out, allowAdded);
    }
    return;
  }
  if (stable(a) !== stable(b))
    out.push({ field: at, origin: show(a), target: show(b) });
}
function parseBody(s) {
  if (!s)
    return;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
var pathOnly = (p) => p.split("?")[0];
function compareExchanges(origin, target, eq, expectDiff) {
  const diffs = [];
  const pairs = [];
  const n = Math.max(origin.length, target.length);
  for (let i = 0;i < n; i++) {
    const o = origin[i];
    const t = target[i];
    pairs.push({ origin: o?.seq ?? null, target: t?.seq ?? null });
    const pre = n > 1 ? `#${i + 1} ` : "";
    if (!o || !t) {
      diffs.push({ field: `${pre}exchange`, origin: o ? `${o.method} ${o.path}` : "(none)", target: t ? `${t.method} ${t.path}` : "(none)" });
      continue;
    }
    if (o.method !== t.method || pathOnly(o.path) !== pathOnly(t.path))
      diffs.push({ field: `${pre}request`, origin: `${o.method} ${o.path}`, target: `${t.method} ${t.path}` });
    if (eq.compare_status && o.status !== t.status)
      diffs.push({ field: `${pre}status`.trim(), origin: String(o.status), target: String(t.status) });
    for (const h of eq.headers) {
      const ov = (o.resHeaders[h] ?? "").split(";")[0].trim();
      const tv = (t.resHeaders[h] ?? "").split(";")[0].trim();
      if (ov !== tv)
        diffs.push({ field: `${pre}header.${h}`.trim(), origin: ov || "(absent)", target: tv || "(absent)" });
    }
    const ob = normalize(parseBody(o.resBody), "", eq);
    const tb = normalize(parseBody(t.resBody), "", eq);
    const bd = [];
    deepDiff(ob, tb, "body", bd, eq.allow_added_fields);
    for (const d of bd)
      diffs.push({ ...d, field: `${pre}${d.field}`.trim() });
  }
  const strip = (f) => f.replace(/^#\d+ /, "");
  if (diffs.length === 0) {
    if (expectDiff.length)
      return { status: "unexplained", diffs, pairs, note: `Expected a difference in ${expectDiff.join(", ")} but origin and target matched.` };
    return { status: "equal", diffs, pairs };
  }
  const explained = diffs.every((d) => expectDiff.some((e) => pathMatches(strip(d.field), e)));
  return { status: explained ? "intended" : "unexplained", diffs, pairs };
}

// engine/src/verify.ts
function declarations(root, base, headClaims, headRetired) {
  if (!base)
    return;
  const list = tryGit(root, ["ls-tree", "--name-only", base.sha, ".witness/claims/"]) ?? "";
  const baseClaims = list.split(`
`).filter((f) => f.endsWith(".md")).flatMap((f) => parseClaimFile(f, tryGit(root, ["show", `${base.sha}:${f}`]) ?? "").claims).filter((c2) => !c2.retired);
  const sig = (c2) => JSON.stringify([c2.text, c2.tags, c2.proof, c2.expectDiff, c2.surfaces]);
  const byId = new Map(baseClaims.map((c2) => [c2.id, c2]));
  const headIds = new Set([...headClaims, ...headRetired].map((c2) => c2.id));
  const lines = (t) => (t ?? "").split(`
`).map((l) => l.split("#")[0].trim()).filter(Boolean);
  const baseEq = lines(tryGit(root, ["show", `${base.sha}:.witness/equivalence.toml`]));
  const headEqFile = path8.join(root, ".witness", "equivalence.toml");
  const headEq = lines(fs8.existsSync(headEqFile) ? fs8.readFileSync(headEqFile, "utf8") : null);
  return {
    rules: { added: headEq.filter((l) => !baseEq.includes(l)), removed: baseEq.filter((l) => !headEq.includes(l)) },
    added: headClaims.filter((c2) => !byId.has(c2.id)).map((c2) => c2.id),
    changed: headClaims.filter((c2) => byId.has(c2.id) && sig(byId.get(c2.id)) !== sig(c2)).map((c2) => c2.id),
    removed: baseClaims.filter((c2) => !headIds.has(c2.id)).map((c2) => c2.id),
    retired: headRetired.filter((c2) => byId.has(c2.id)).map((c2) => c2.id)
  };
}
var cacheDir = (c2, layer, key) => path8.join(c2.home, "cache", layer, key);
function resolveBase(root, base) {
  if (base === null)
    return null;
  const candidates = base ? [base] : ["origin/main", "main", "origin/master", "master"];
  for (const ref of candidates) {
    const s = tryGit(root, ["merge-base", "HEAD", ref]);
    if (s) {
      const head = tryGit(root, ["rev-parse", "HEAD"]);
      if (!base && s === head && worktreeHash(root) === tryGit(root, ["rev-parse", "HEAD^{tree}"])?.slice(0, 16))
        continue;
      return { ref, sha: s };
    }
  }
  if (base)
    throw new Error(`Can't resolve base "${base}" (git merge-base HEAD ${base} failed).`);
  return null;
}
async function capture(contract, side, logDir, rerun, only) {
  await side.boot();
  try {
    const runs = await runSuites(contract, side, { logDir, only });
    const reruns = [];
    const failed = runs.flatMap((r) => r.results.filter((t) => t.status === "failed").map((t) => t.id));
    if (rerun && failed.length && failed.length <= 10) {
      say("testimony", `${side.name}: re-examining ${failed.length} failed test(s) to rule out an unreliable witness`);
      reruns.push(...await runSuites(contract, side, { logDir, only: failed, run: "rerun" }));
    }
    return { runs, reruns, exchanges: side.exchanges(), bootMs: side.bootMs };
  } finally {
    await side.shutdown();
  }
}
async function captureOrigin(contract, o, tests, testsKey, contractHash, logDir, fresh, bundle) {
  const originSha = tryGit(o.repoPath, ["rev-parse", "HEAD"]) ?? "untracked";
  const oKey = sha(`${originSha}|${testsKey}|${contractHash}`);
  const dir = cacheDir(contract, "origin", oKey);
  const file = (t) => path8.join(dir, `${t.replace(/[^\w.-]+/g, "_")}.json`);
  const missing = tests.filter((t) => fresh || !fs8.existsSync(file(t)));
  const t1 = Date.now();
  if (missing.length) {
    say("subpoena", `booting origin ${o.repo}@${originSha.slice(0, 7)} for ${missing.length} test(s) not yet on record`);
    const side = new Side("origin", contract, o.repoPath, logDir, { services: o.services, rewrite: (u) => mapRoute(o.routes ?? [], u) });
    const cap = await capture(contract, side, logDir, false, missing);
    const results = byId(cap.runs);
    for (const t of missing)
      writeJson(file(t), { result: results.get(t) ?? null, exchanges: cap.exchanges.filter((e) => e.test === t) });
  } else
    say("subpoena", `origin ${o.repo}@${originSha.slice(0, 7)}: all ${tests.length} test(s) already on record`);
  const per = tests.map((t) => readJson(file(t), { result: null, exchanges: [] }));
  bundle.layers.origin = { key: oKey, reused: missing.length === 0, ms: missing.length ? Date.now() - t1 : undefined, note: `${tests.length - missing.length} reused, ${missing.length} captured` };
  return {
    runs: [{ suite: "origin", side: "origin", run: "primary", code: 0, ms: 0, log: "", results: per.map((p) => p.result).filter((r) => !!r) }],
    reruns: [],
    exchanges: per.flatMap((p) => p.exchanges),
    bootMs: 0
  };
}
function byId(runs) {
  const m = new Map;
  for (const r of runs)
    for (const t of r.results)
      m.set(t.id, t);
  return m;
}
function testSource(root, id) {
  const [cls, method] = id.split("#");
  const files = fs8.globSync(path8.join(root, "**", `${cls}.*`)).filter((f) => !f.includes("node_modules") && !f.includes("/target/") && !f.includes("/.witness/"));
  for (const f of files) {
    const lines = fs8.readFileSync(f, "utf8").split(`
`);
    const i = lines.findIndex((l) => new RegExp(`\\b${method}\\s*\\(`).test(l));
    if (i >= 0) {
      let start = i;
      while (start > 0 && /^\s*@/.test(lines[start - 1]))
        start--;
      let depth = 0;
      let end = i;
      for (let j = i;j < lines.length; j++) {
        depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
        end = j;
        if (j > i && depth <= 0)
          break;
      }
      return { file: path8.relative(root, f), line: start + 1, snippet: lines.slice(start, Math.min(end + 1, start + 60)).join(`
`) };
    }
  }
  return;
}
function loadSources(root, home, base, extra, why) {
  const out = [];
  const atBase = (rel) => base ? tryGit(root, ["show", `${base.sha}:${rel}`]) : null;
  const verify = atBase("VERIFY.md");
  if (verify)
    out.push({ name: "VERIFY.md@base", text: verify, canOverturn: true });
  if (base) {
    const list = tryGit(root, ["ls-tree", "--name-only", base.sha, ".witness/sources/"]);
    for (const f of (list ?? "").split(`
`).filter(Boolean)) {
      const t = atBase(f);
      if (t)
        out.push({ name: `${f}@base`, text: t, canOverturn: true });
    }
  }
  const realRoot = fs8.realpathSync(root);
  for (const f of extra) {
    const abs = fs8.realpathSync(path8.resolve(f));
    const inside = abs.startsWith(realRoot + path8.sep);
    out.push({ name: path8.basename(f), text: fs8.readFileSync(abs, "utf8"), canOverturn: !inside, path: abs });
  }
  for (const f of fs8.existsSync(path8.join(home, "claims")) ? fs8.readdirSync(path8.join(home, "claims")) : [])
    out.push({ name: `claims/${f}`, text: fs8.readFileSync(path8.join(home, "claims", f), "utf8"), canOverturn: false });
  const local = path8.join(root, "VERIFY.md");
  if (fs8.existsSync(local) && !verify)
    out.push({ name: "VERIFY.md", text: fs8.readFileSync(local, "utf8"), canOverturn: false });
  if (base) {
    const log = tryGit(root, ["log", "--format=%s%n%b", `${base.sha}..HEAD`]);
    if (log)
      out.push({ name: "commit-messages", text: log, canOverturn: false });
  }
  if (why)
    out.push({ name: "change-description", text: why, canOverturn: false });
  return out;
}
function exchangeText(ex) {
  return ex.map((e) => `[${e.side}] ${e.method} ${e.path}${e.reqBody ? `
  request: ${e.reqBody.slice(0, 800)}` : ""}
  -> ${e.status} ${e.resBody.slice(0, 1500)}`).join(`
`);
}
async function verify(contract, opts) {
  const t0 = Date.now();
  const root = contract.root;
  const recordId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const dir = path8.join(contract.home, "records", recordId);
  const logDir = path8.join(dir, "logs");
  fs8.mkdirSync(logDir, { recursive: true });
  fs8.writeFileSync(path8.join(contract.home, ".gitignore"), `records/
cache/
`);
  const tree = worktreeHash(root);
  const headSha = tryGit(root, ["rev-parse", "HEAD"]);
  const branch = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = tree !== (tryGit(root, ["rev-parse", "HEAD^{tree}"]) ?? "").slice(0, 16);
  const base = resolveBase(root, opts.base);
  const files = loadClaims(contract.home);
  const claims = files.flatMap((f) => f.claims).filter((c2) => !c2.retired);
  const retiredClaims = files.flatMap((f) => f.claims).filter((c2) => c2.retired);
  const migrate = !!contract.origin?.repo;
  const contractHash = sha(contract.raw);
  const warnings = lint(contract, files).filter((w) => w.level !== "error").map((w) => w.message);
  say("court in session", `level ${opts.level} · this change: ${branch ?? "?"}@${(headSha ?? "").slice(0, 7)}${dirty ? " + uncommitted edits" : ""} · compared with: ${base ? `${base.ref}@${base.sha.slice(0, 7)}` : "nothing (no base commit)"}${migrate ? ` and the legacy app ${contract.origin.repo}` : ""} · ${claims.length} claims`);
  const bundle = {
    schema: "witness.record/v0",
    level: opts.level,
    verdict: "mistrial",
    repo: root,
    head: { tree, sha: headSha, branch, dirty },
    base: base ?? undefined,
    startedAt: new Date(t0).toISOString(),
    ms: 0,
    counts: {},
    claims: [],
    regressions: [],
    otherTests: [],
    exchanges: [],
    layers: {},
    warnings,
    sources: [],
    logs: [],
    judgeCalls: 0
  };
  try {
    const errors = lint(contract, files).filter((w) => w.level === "error");
    if (errors.length)
      throw new Mistrial(`The claims don't hold together: ${errors.map((e) => e.message).join("; ")}`, "Fix the claims files (see `witness lint`).");
    const captureTree = worktreeHash(root, [".witness/claims", ".witness/equivalence.toml", ".witness/sources", "VERIFY.md"]);
    const tKey = sha(`${captureTree}|${contractHash}`);
    const tFile = path8.join(cacheDir(contract, "target", tKey), "capture.json");
    let target = opts.fresh ? null : readJson(tFile, null);
    if (target)
      say("record", "this change is already on record (same code and tests); reused");
    else {
      const t1 = Date.now();
      target = await capture(contract, new Side("head", contract, root, logDir), logDir, opts.rerun);
      writeJson(tFile, target);
      bundle.layers.target = { key: tKey, reused: false, ms: Date.now() - t1 };
    }
    bundle.layers.target ??= { key: tKey, reused: true };
    let baseCap = null;
    const testGlobs = contract.suites.map((s) => s.tests);
    const testsKey = testGlobs.every(Boolean) ? hashFiles(testGlobs.flatMap((g) => fs8.globSync(path8.join(root, g)))) : captureTree;
    const needsBite = claims.some((c2) => c2.proof && !c2.tags.includes("parity") && !c2.tags.includes("judged") && !(migrate && c2.tags.includes("changed")));
    const needBase = !!base && (needsBite || opts.level === "high" && !migrate);
    if (base && !needBase)
      say("subpoena", `skipping ${base.ref}: no claim needs the bite check${migrate ? " (the origin is the legacy app)" : ""}`);
    if (base && needBase) {
      const bKey = sha(`${base.sha}|${testsKey}|${contractHash}`);
      const bFile = path8.join(cacheDir(contract, "base", bKey), "capture.json");
      baseCap = opts.fresh ? null : readJson(bFile, null);
      if (baseCap) {
        say("subpoena", `${base.ref}@${base.sha.slice(0, 7)} already on record; reused`);
        bundle.layers.base = { key: bKey, reused: true };
      } else {
        const t1 = Date.now();
        say("subpoena", `booting ${base.ref}@${base.sha.slice(0, 7)} (the base commit) in a temporary worktree`);
        const wt = path8.join(os3.tmpdir(), `witness-base-${base.sha.slice(0, 12)}-${process.pid}`);
        git(root, ["worktree", "add", "--detach", "-f", wt, base.sha]);
        const unregister = registerCleanup(() => void tryGit(root, ["worktree", "remove", "--force", wt]));
        try {
          baseCap = await capture(contract, new Side("base", contract, wt, logDir), logDir, false);
        } finally {
          tryGit(root, ["worktree", "remove", "--force", wt]);
          unregister();
        }
        writeJson(bFile, baseCap);
        bundle.layers.base = { key: bKey, reused: false, ms: Date.now() - t1 };
      }
    }
    const head = byId(target.runs);
    const rerun = byId(target.reruns);
    const baseRes = baseCap ? byId(baseCap.runs) : undefined;
    const primary = (caps, test) => (caps?.exchanges ?? []).filter((e) => e.run === "primary" && e.test === test).sort((a, b) => a.seq - b.seq);
    const parityClaims = claims.filter((c2) => c2.proof && (c2.tags.includes("parity") || c2.tags.includes("changed")));
    let originCap = null;
    if (opts.level === "high") {
      const o = contract.origin;
      if (o?.repo) {
        originCap = await captureOrigin(contract, o, parityClaims.map((c2) => c2.proof), testsKey, contractHash, logDir, opts.fresh, bundle);
        bundle.originSide = "origin";
        bundle.origin = { kind: "migrate", repo: o.repo, sha: tryGit(o.repoPath, ["rev-parse", "HEAD"]) };
      } else if (baseCap) {
        originCap = baseCap;
        bundle.originSide = "base";
        bundle.origin = { kind: "evolve", repo: ".", sha: base.sha };
        bundle.layers.origin = { key: bundle.layers.base.key, reused: true, note: "same as the base layer" };
      }
    }
    const decl = declarations(root, base, claims, retiredClaims);
    bundle.declarations = decl;
    const baseEqText = base ? tryGit(root, ["show", `${base.sha}:.witness/equivalence.toml`]) : null;
    const rulesChanged = !!decl && (decl.rules.added.length > 0 || decl.rules.removed.length > 0);
    const eqBase = base ? parseEquivalence(baseEqText) : contract.equivalence;
    const parity = new Map;
    const parityHeadRules = new Map;
    const existing = [];
    if (opts.level === "high") {
      if (!originCap)
        bundle.warnings.push("High level needs an origin: a base commit or an [origin] repo in witness.toml. None was found, so nothing was compared.");
      else {
        const pKey = sha(`${bundle.layers.target.key}|${bundle.layers.origin.key}|${JSON.stringify(eqBase)}|${JSON.stringify(contract.equivalence)}`);
        say("cross-examination", `comparing ${migrate ? "the legacy app" : base?.ref ?? "the origin"} with this change for ${parityClaims.length} claim(s)`);
        for (const c2 of parityClaims) {
          parity.set(c2.id, compareExchanges(primary(originCap, c2.proof), primary(target, c2.proof), eqBase, c2.expectDiff));
          if (rulesChanged)
            parityHeadRules.set(c2.id, compareExchanges(primary(originCap, c2.proof), primary(target, c2.proof), contract.equivalence, c2.expectDiff));
        }
        if (!migrate) {
          const claimedTests = new Set(claims.map((c2) => c2.proof).filter(Boolean));
          for (const t of target.runs.flatMap((r) => r.results)) {
            if (claimedTests.has(t.id) || t.status !== "passed")
              continue;
            const o = primary(originCap, t.id);
            if (!o.length)
              continue;
            const p = compareExchanges(o, primary(target, t.id), eqBase, []);
            if (p.status !== "equal")
              existing.push({ test: t.id, parity: p });
          }
        }
        bundle.layers.parity = { key: pKey, reused: false, note: `${parity.size} claim(s) and ${existing.length} unclaimed difference(s)` };
      }
    }
    const results = claims.map((c2) => {
      const r = assessClaim(c2, { head, base: baseRes, rerun, parity: parity.get(c2.id), level: opts.level, migrate, observed: c2.proof ? primary(target, c2.proof).length : undefined });
      if (c2.proof)
        r.source = testSource(root, c2.proof);
      return r;
    });
    existing.forEach(({ test, parity: p }, i) => {
      const r = assessClaim({ id: `E${i + 1}`, text: `${test} gets the same responses as on ${base?.ref ?? "main"}`, surfaces: ["api"], tags: ["parity"], proof: test, expectDiff: [], feature: "Existing behavior (no claim)", file: "(none)", line: 0 }, { head, base: baseRes, rerun, parity: p, level: opts.level, migrate });
      r.synthetic = "existing";
      r.reasons.unshift(`No claim covers this test, but its responses changed compared with ${base?.ref ?? "main"}. Fix the regression, or add a claim tagged changed.`);
      r.source = testSource(root, test);
      results.push(r);
    });
    const sources = loadSources(root, contract.home, base, opts.sources, opts.why);
    bundle.sources = sources.map((s) => ({ name: s.name, canOverturn: s.canOverturn, path: s.path }));
    const toJudge = results.filter((r) => r.tags.includes("judged") && r.status === "cant_tell" || r.parity?.status === "unexplained" && r.status === "failed");
    if (toJudge.length && opts.judge) {
      say("deliberation", `the judge reviews ${toJudge.length} item(s)`);
      for (const r of toJudge) {
        const kind = r.parity?.status === "unexplained" ? "parity" : "judged";
        const ex = r.testId ? [...kind === "parity" ? primary(originCap, r.testId) : [], ...primary(target, r.testId)] : [];
        const evidence = kind === "parity" ? `Differences (origin -> target):
${r.parity.diffs.map((d) => `- ${d.field}: ${d.origin} -> ${d.target}`).join(`
`)}

Exchanges:
${exchangeText(ex)}` : `${r.evidence ? `Evidence hint: ${r.evidence}
` : ""}Exchanges:
${exchangeText(ex.length ? ex : target.exchanges.filter((e) => !r.evidence || e.path.includes(r.evidence.split(" ").pop() ?? "")).slice(0, 12))}`;
        const question = kind === "parity" ? "Is this difference between origin and target justified by a source that may justify an overturn? If yes, answer overturn with the verbatim quote; otherwise fail or cant_tell." : "Does the evidence show the claim holds? Answer pass, fail or cant_tell, and flag any ambiguity between the claim, the change description and the behavior.";
        const j = judge({ kind, claim: `${r.id}: ${r.text}`, question, evidence }, sources, path8.join(contract.home, "cache", "judge"));
        if (!j.cached)
          bundle.judgeCalls++;
        say("deliberation", `${r.id}: ${j.accepted}${j.error ? ` (${j.error.slice(0, 80)})` : ""}${j.cached ? " (ruling on record, reused)" : ` in ${fmtMs(j.ms)}`}`);
        applyJudge(r, j, kind);
      }
    } else if (toJudge.length) {
      for (const r of toJudge)
        if (r.tags.includes("judged"))
          r.reasons.push("Judge skipped (--no-judge).");
    }
    for (const r of results) {
      const hp = parityHeadRules.get(r.id);
      if (r.status === "failed" && r.parity?.status === "unexplained" && hp && hp.status !== "unexplained") {
        r.status = "cant_tell";
        r.reasons.push(`It matches only under the equivalence rules this PR changes (${[...decl.rules.added.map((l) => "+ " + l), ...decl.rules.removed.map((l) => "- " + l)].join("; ")}). A reviewer has to approve the rule change; it counts once merged.`);
      }
    }
    const request2 = [opts.why ?? "", ...sources.filter((s) => s.canOverturn && !s.name.includes("@base")).map((s) => s.text)].join(`

`).trim();
    if (request2 && opts.judge) {
      say("deliberation", "checking that the claims cover the request");
      const list = claims.map((c2) => `${c2.id} [${[...c2.surfaces, ...c2.tags].join(", ")}] ${c2.text}`).join(`
`);
      const cov = coverage(request2, list, path8.join(contract.home, "cache", "judge"));
      if (!cov.cached && !cov.error)
        bundle.judgeCalls++;
      bundle.coverage = { checked: !cov.error, note: cov.note, error: cov.error };
      cov.uncovered.forEach((u, i) => {
        results.push({
          id: `U${i + 1}`,
          text: u.requirement,
          surfaces: [],
          tags: [],
          expectDiff: [],
          feature: "Not covered by a claim",
          file: "(request)",
          line: 0,
          status: "not_tested",
          bite: null,
          synthetic: "uncovered",
          reasons: [`The request asks for this, but no claim covers it: “${u.quote}”. Add a claim, or tell the reviewer why it's out of scope.`]
        });
      });
    }
    const problems = (decl?.removed.length ?? 0) + results.filter((r) => r.synthetic === "uncovered").length;
    if (decl?.removed.length)
      bundle.warnings.unshift(`Claims deleted in this PR without a retired: reason: ${decl.removed.join(", ")}. Keep them and add "retired: <why>" so the reviewer sees it.`);
    const claimed = new Set(results.map((r) => r.testId).filter(Boolean));
    const all = [...head.values()];
    bundle.regressions = all.filter((t) => !claimed.has(t.id) && t.status === "failed" && rerun.get(t.id)?.status !== "passed");
    bundle.otherTests = all.filter((t) => !claimed.has(t.id));
    if (!all.length)
      throw new Mistrial("No test results were found after the suites ran.", "Check the suite command and its junit path in witness.toml; see the suite log.", "");
    bundle.claims = results;
    bundle.exchanges = [...baseCap?.exchanges ?? [], ...originCap && originCap !== baseCap ? originCap.exchanges : [], ...target.exchanges].filter((e) => e.run === "primary" || e.run === "rerun");
    bundle.verdict = overall(results, bundle.regressions, problems);
    bundle.counts = counts(results);
  } catch (e) {
    if (e instanceof Mistrial) {
      bundle.verdict = "mistrial";
      bundle.mistrial = { message: e.message, remedy: e.remedy, logTail: e.logTail };
    } else
      throw e;
  } finally {
    bundle.ms = Date.now() - t0;
    bundle.logs = fs8.existsSync(logDir) ? fs8.readdirSync(logDir) : [];
  }
  writeRecord(dir, bundle);
  return { bundle, dir };
}

// engine/src/cli.ts
var HELP = `witness: verify a change at its API boundary and keep the record.

Usage:
  witness verify [--level medium|high] [--base <ref> | --no-base] [--no-judge]
                 [--source <file>]... [--why <text>] [--fresh] [--no-rerun] [--json]
  witness lint                 check claims and contract without running anything
  witness doctor               check prerequisites, then boot the app once and probe it
  witness init                 write a starter .witness/witness.toml and VERIFY.md
  witness status [--hook]      is the latest record fresh for the current working tree?
  witness open                 print (and on macOS open) the latest record
  witness ci github            write .github/workflows/witness.yml (verify every PR, comment, gate)
  witness report [--format agent|pr|summary]   print a view of the latest record

Levels: medium checks the change against its claims; high also cross-examines the
origin (the base commit) and compares what both apps returned.
Exit codes: 0 proven · 1 needs a look or nothing proven · 2 mistrial (app or claims couldn't be put on trial) · 3 usage.`;
function args(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0;i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      const takes = ["level", "base", "source", "why", "format"].includes(k);
      const v = inline ?? (takes ? argv[++i] : true);
      if (k === "source")
        (flags.source = flags.source ?? []).push(String(v));
      else
        flags[k] = v;
    } else
      pos.push(a);
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}
function root() {
  const r = findRoot(process.cwd());
  if (!r) {
    console.error("No .witness/witness.toml found here or in a parent folder. Run `witness init` in the repo root.");
    process.exit(3);
  }
  return r;
}
function latestDir(home) {
  const recs = path9.join(home, "records");
  if (!fs9.existsSync(recs))
    return null;
  const dirs = fs9.readdirSync(recs).filter((d) => d !== "latest" && fs9.existsSync(path9.join(recs, d, "bundle.json"))).sort();
  return dirs.length ? path9.join(recs, dirs[dirs.length - 1]) : null;
}
async function main() {
  const { cmd, flags } = args(process.argv.slice(2));
  if (!cmd || flags.help || cmd === "help") {
    console.log(HELP);
    return;
  }
  try {
    switch (cmd) {
      case "verify": {
        const contract = loadContract(root());
        const level = String(flags.level ?? "medium");
        if (level !== "medium" && level !== "high")
          throw new ContractError(`--level must be medium or high, not ${level}`);
        const { bundle, dir } = await verify(contract, {
          level,
          base: flags["no-base"] ? null : flags.base,
          judge: !flags["no-judge"],
          sources: flags.source ?? [],
          why: flags.why,
          rerun: !flags["no-rerun"],
          fresh: !!flags.fresh
        });
        if (flags.json)
          console.log(JSON.stringify({ verdict: bundle.verdict, counts: bundle.counts, record: dir }, null, 2));
        else {
          const lines = summaryLines(bundle);
          const col = bundle.verdict === "proven" ? color.green : bundle.verdict === "mistrial" || bundle.verdict === "unproven" ? color.yellow : color.red;
          console.log(`
` + col(color.bold(lines[0])));
          for (const l of lines.slice(1))
            console.log(l);
          console.log(`
Record:  ${path9.join(dir, "index.html")}`);
          console.log(`For agents: ${path9.join(dir, "agent.md")}`);
        }
        process.exitCode = bundle.verdict === "proven" ? 0 : bundle.verdict === "mistrial" ? 2 : 1;
        return;
      }
      case "lint": {
        const contract = loadContract(root());
        const files = loadClaims(contract.home);
        const issues = lint(contract, files);
        const n = files.reduce((a, f) => a + f.claims.length, 0);
        for (const i of issues)
          console.log(`${i.level === "error" ? color.red("error") : color.yellow("warning")}  ${i.message}`);
        console.log(`${n} claim(s) in ${files.length} file(s) · ${issues.filter((i) => i.level === "error").length} error(s) · ${issues.filter((i) => i.level === "warning").length} warning(s)`);
        process.exitCode = issues.some((i) => i.level === "error") ? 1 : 0;
        return;
      }
      case "doctor": {
        const r = root();
        const checks = [];
        const docker = spawnSync3("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
        checks.push(["docker is running", docker.status === 0, "Start Docker Desktop (needed if your contract uses containers)."]);
        checks.push(["git repository", spawnSync3("git", ["rev-parse"], { cwd: r }).status === 0, "Run witness inside a git repository."]);
        const claude = spawnSync3(process.env.WITNESS_CLAUDE_BIN || "claude", ["--version"], { encoding: "utf8" });
        checks.push(["claude CLI for the judge", claude.status === 0, "Install Claude Code, or run verify with --no-judge."]);
        let contract;
        try {
          contract = loadContract(r);
          checks.push(["contract parses", true, ""]);
        } catch (e) {
          checks.push(["contract parses", false, e.message]);
        }
        for (const [name, ok, fix] of checks)
          console.log(`${ok ? color.green("ok  ") : color.red("FAIL")} ${name}${ok ? "" : `  →  ${fix}`}`);
        if (!contract || checks.some((c2) => !c2[1])) {
          process.exitCode = 2;
          return;
        }
        const logDir = path9.join(contract.home, "records", "doctor");
        const side = new Side("head", contract, r, logDir);
        try {
          await side.boot();
          for (const [k, v] of Object.entries(side.surfaceEnv())) {
            const res = await fetch(v).catch((e) => ({ status: `error ${e.message}` }));
            console.log(`${color.green("ok  ")} ${k}=${v} answers (HTTP ${res.status})`);
          }
          console.log(color.green(`
The app boots in ${(side.bootMs / 1000).toFixed(1)}s. Next: witness verify`));
        } catch (e) {
          if (e instanceof Mistrial) {
            console.log(`${color.red("FAIL")} boot: ${e.message}
  →  ${e.remedy}
${color.dim(e.logTail)}`);
            process.exitCode = 2;
          } else
            throw e;
        } finally {
          await side.shutdown();
        }
        return;
      }
      case "init": {
        const r = findRoot(process.cwd()) ?? process.cwd();
        const home = path9.join(r, ".witness");
        const file = path9.join(home, "witness.toml");
        if (fs9.existsSync(file)) {
          console.log(`${file} already exists.`);
          return;
        }
        fs9.mkdirSync(path9.join(home, "claims"), { recursive: true });
        fs9.writeFileSync(file, TEMPLATE);
        fs9.writeFileSync(path9.join(home, ".gitignore"), `records/
cache/
`);
        if (!fs9.existsSync(path9.join(r, "VERIFY.md")))
          fs9.writeFileSync(path9.join(r, "VERIFY.md"), "# How this app is verified\n\n- Boot: see `.witness/witness.toml`.\n- Claims: `.witness/claims/*.md`, one sentence of behavior each, linked to a boundary test.\n- Run: `witness verify` (add `--level high` to compare with the base commit).\n");
        console.log(`Wrote ${file} and VERIFY.md. Edit the start/ready/suite lines, then run \`witness doctor\`.`);
        return;
      }
      case "status": {
        const r = findRoot(process.cwd());
        if (!r) {
          if (flags.hook)
            return;
          console.log("No .witness/ here.");
          return;
        }
        const dir = latestDir(path9.join(r, ".witness"));
        const b = dir ? readJson(path9.join(dir, "bundle.json"), null) : null;
        const tree = worktreeHash(r);
        const fresh = b && b.head?.tree === tree;
        if (flags.hook) {
          const input = readJson("/dev/stdin", {});
          if (input.stop_hook_active || process.env.WITNESS_HOOK === "off" || fresh)
            return;
          if (!b && !hasCodeChanges(r))
            return;
          const why = b ? `the code changed since the last verdict (${VERDICT_WORD[b.verdict]})` : "this repo has witness claims but no verdict yet";
          console.log(JSON.stringify({ decision: "block", reason: `Witness: ${why}. Run \`witness verify\` (or /witness:verify) and report the verdict before finishing. Set WITNESS_HOOK=off to skip.` }));
          return;
        }
        if (!b)
          console.log("No record yet. Run `witness verify`.");
        else
          console.log(`${fresh ? "fresh" : "stale"} · ${VERDICT_WORD[b.verdict]} · ${b.startedAt} · ${path9.join(dir, "index.html")}`);
        process.exitCode = fresh ? 0 : 1;
        return;
      }
      case "ci": {
        const r = root();
        const file = path9.join(r, ".github", "workflows", "witness.yml");
        if (fs9.existsSync(file) && !flags.force) {
          console.log(`${file} already exists (use --force to overwrite).`);
          return;
        }
        fs9.mkdirSync(path9.dirname(file), { recursive: true });
        fs9.writeFileSync(file, GITHUB_WORKFLOW);
        console.log(`Wrote ${file}. Set the WITNESS_CLI_URL variable and (for the judge) the ANTHROPIC_API_KEY secret.`);
        return;
      }
      case "open":
      case "report": {
        const r = root();
        const dir = latestDir(path9.join(r, ".witness"));
        if (!dir) {
          console.log("No record yet. Run `witness verify`.");
          process.exitCode = 1;
          return;
        }
        if (cmd === "open") {
          const f = path9.join(dir, "index.html");
          console.log(f);
          if (process.platform === "darwin" && !flags["no-browser"])
            spawnSync3("open", [f]);
          return;
        }
        const fmt = String(flags.format ?? "summary");
        if (fmt === "agent")
          console.log(fs9.readFileSync(path9.join(dir, "agent.md"), "utf8"));
        else if (fmt === "pr")
          console.log(fs9.readFileSync(path9.join(dir, "pr.md"), "utf8"));
        else
          console.log(summaryLines(readJson(path9.join(dir, "bundle.json"), {})).join(`
`));
        return;
      }
      default:
        console.error(`Unknown command "${cmd}".

${HELP}`);
        process.exitCode = 3;
    }
  } catch (e) {
    if (e instanceof ContractError) {
      console.error(color.red(`Contract problem: ${e.message}`));
      process.exitCode = 2;
    } else {
      console.error(color.red(`witness failed: ${e.stack ?? e}`));
      process.exitCode = 2;
    }
  }
}
var GITHUB_WORKFLOW = `# Verify every pull request with witness and post the record. Generated by \`witness ci github\`.
name: witness
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - name: Install witness
        run: |
          mkdir -p "$HOME/.local/bin"
          curl -fsSL "\${{ vars.WITNESS_CLI_URL }}" -o "$HOME/.local/bin/witness.mjs"
          printf '#!/bin/sh\\nexec node "$HOME/.local/bin/witness.mjs" "$@"\\n' > "$HOME/.local/bin/witness" && chmod +x "$HOME/.local/bin/witness"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
      - name: Install Claude Code for the judge
        if: env.ANTHROPIC_API_KEY != ''
        run: npm i -g @anthropic-ai/claude-code
      - name: Verify
        id: verify
        run: |
          set +e
          JUDGE=""; [ -z "$ANTHROPIC_API_KEY" ] && JUDGE="--no-judge"
          witness verify --base "origin/\${{ github.base_ref }}" --level "\${{ vars.WITNESS_LEVEL || 'medium' }}" $JUDGE
          echo "code=$?" >> "$GITHUB_OUTPUT"
      - name: Comment on the PR
        if: always()
        env: { GH_TOKEN: "\${{ github.token }}" }
        run: gh pr comment "\${{ github.event.pull_request.number }}" --body-file .witness/records/latest/pr.md --edit-last || gh pr comment "\${{ github.event.pull_request.number }}" --body-file .witness/records/latest/pr.md
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: witness-record, path: .witness/records/latest/ }
      - name: Gate
        run: test "\${{ steps.verify.outputs.code }}" = "0"
`;
function hasCodeChanges(r) {
  const s = spawnSync3("git", ["status", "--porcelain", "--", ".", ":(exclude).witness/records", ":(exclude).witness/cache"], { cwd: r, encoding: "utf8" });
  return !!s.stdout.trim();
}
var stopping = false;
var stop = async () => {
  if (stopping)
    process.exit(130);
  stopping = true;
  process.stderr.write(`
Interrupted: stopping the apps and removing temporary worktrees...
`);
  await runCleanups();
  process.exit(130);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
main();
