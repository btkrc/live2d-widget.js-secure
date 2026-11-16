// Modified by xiazeyu.

// Modified by zekalryn（李晟赫）, 2026-11-17

/**
* @desc To get the model settings from given json file
*/

import { Live2DFramework } from "../lib/Live2DFramework"


//============================================================
//    private helpers（仅本文件内部使用）
//============================================================

/**
* @name decodeUtf8
* @desc 把字节数组解码成 utf-8 字符串（优先 TextDecoder，缺失时回退）
* @param {Uint8Array} bytes
* @returns {String}
*/
function decodeUtf8(bytes) {
    if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(bytes);
    }

    //  回退：逐字节拼接，避免 String.fromCharCode.apply 在长文本上爆栈
    var str = "";
    for (var i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
    }

    try {
        return decodeURIComponent(escape(str));
    } catch (e) {
        return str;
    }
}

/**
* @name looksLikeJson
* @desc 去掉 BOM 与空白后，判断首字符是否为 { 或 [
* @param {String} str
* @returns {Boolean}
*/
function looksLikeJson(str) {
    if (typeof str !== "string" || str.length === 0) return false;

    var head = str.replace(/^[\uFEFF\s]+/, "").charAt(0);

    return head === "{" || head === "[";
}

/**
* @name hexPreview
* @desc 输出前若干个字节的 hex + ascii 预览
*       用于定位"拿到 HTML 错误页 / SQLite 假头 / 空内容"等非 JSON 数据
* @param {Uint8Array} bytes, {int} count
* @returns {String}
*/
function hexPreview(bytes, count) {
    if (!bytes || typeof bytes.length !== "number") return "(empty)";

    var len = Math.min(bytes.length, count || 16);
    var hex = [];
    var ascii = "";

    for (var i = 0; i < len; i++) {
        var b = bytes[i];
        hex.push((b < 16 ? "0" : "") + b.toString(16).toUpperCase());
        ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : ".";
    }

    return hex.join(" ") + "  |  " + ascii;
}


/**
* @name ModelSettingJson
* @desc return the struct of ModelSettingJson
* @param null
* @returns {Structure} ModelSettingJson
*/
export function ModelSettingJson() {   // Define the index in the json file.
    this.NAME = "name";
    this.ID = "id";
    this.MODEL = "model";
    this.TEXTURES = "textures";
    this.HIT_AREAS = "hit_areas";
    this.PHYSICS = "physics";
    this.POSE = "pose";
    this.EXPRESSIONS = "expressions";
    this.MOTION_GROUPS = "motions";
    this.SOUND = "sound";
    this.FADE_IN = "fade_in";
    this.FADE_OUT = "fade_out";
    this.LAYOUT = "layout";
    this.INIT_PARAM = "init_param";
    this.INIT_PARTS_VISIBLE = "init_parts_visible";
    this.VALUE = "val";
    this.FILE = "file";
    this.json = {};
}

/**
* @name loadModelSetting
* @desc load model settings from json
* @param {string} jsonPath, {function} callback
* @returns null
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.loadModelSetting = function (path, callback) {
    var thisRef = this;
    var pm = Live2DFramework.getPlatformManager();
    pm.loadBytes(path, function (buf) {

        //  JSON 解密密钥（必须与 l2d_tool/encrypt_json.js 中的 SECRET_KEY 一致）
        var _sec = "_YOUR_SUCURE_KEY__!";

        //  加密文件写入的假头长度（32 字节，内容为 "SQLite format 3\0"）
        var _headerLen = 32;

        // ==========================================================

        var _json = null;

        try {
            if (!buf || typeof buf.byteLength !== "number" || buf.byteLength === 0) {
                //  空响应：多为浏览器跟踪防护 / 扩展 / 404 拦截
                console.error("[Live2D] 模型配置为空，疑似被浏览器跟踪防护或扩展拦截 : " + path);
            } else {
                var _raw = new Uint8Array(buf);
                var _rawStr = decodeUtf8(_raw);

                if (looksLikeJson(_rawStr)) {
                    //  兼容未加密的明文配置（旧版文件 / 本地调试）
                    _json = JSON.parse(_rawStr);
                } else if (_raw.length <= _headerLen) {
                    //  连假头都不完整，肯定不是有效的加密配置
                    console.error("[Live2D] 模型配置长度异常（" + _raw.length + " 字节），疑似被拦截或文件损坏 : "
                        + path + " | 前16字节: " + hexPreview(_raw));
                } else {
                    var _dataLen = _raw.length - _headerLen;
                    var _dec = new Uint8Array(_dataLen);

                    // 核心解密算法：跳过多字节假头后逐字节 XOR 与动态移位
                    for (var i = 0; i < _dataLen; i++) {
                        var _kb = _sec.charCodeAt(i % _sec.length);
                        var _mix = _raw[i + _headerLen];

                        _dec[i] = _mix ^ _kb ^ (i & 0xFF);
                    }

                    var _str = decodeUtf8(_dec);

                    if (!looksLikeJson(_str)) {
                        //  解密后不像 json：密钥 / 假头长度不匹配，或文件被替换
                        console.error("[Live2D] 模型配置解密失败，请检查密钥与假头长度 : "
                            + path + " | 前16字节: " + hexPreview(_raw));
                    } else {
                        _json = JSON.parse(_str);
                    }
                }
            }
        } catch (err) {
            //  JSON.parse 等异常不再向外冒泡，避免打断整条模型加载链
            console.error("[Live2D] 模型配置解析异常 : " + path, err);
            _json = null;
        }

        // ==========================================================

        thisRef.json = _json;

        //  解析失败时不再执行 callback：
        //  避免下游拿空配置继续请求（modelHomeDir + "undefined"）而刷屏 404
        if (_json === null) return;

        callback();
    });
};

/**
* @name getTextureFile
* @desc get texture file from json
* @param {int} order number of texture
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getTextureFile = function (n) {
    if (this.json[this.TEXTURES] == null || this.json[this.TEXTURES][n] == null)
        return null;

    return this.json[this.TEXTURES][n];
}

/**
* @name getModelFile
* @desc get model file from json
* @param null
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getModelFile = function () {
    return this.json[this.MODEL];
};

/**
* @name getTextureNum
* @desc get the amount of textures from json
* @param null
* @returns {int} amout
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getTextureNum = function () {
    if (this.json[this.TEXTURES] == null) return 0;

    return this.json[this.TEXTURES].length;
}

/**
* @name getHitAreaNum
* @desc get the amount of hit area from json
* @param null
* @returns {int} amout
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getHitAreaNum = function () {
    if (this.json[this.HIT_AREAS] == null)
        return 0;

    return this.json[this.HIT_AREAS].length;
}

/**
* @name getHitAreaID
* @desc get the hit area ID of given index from json
* @param {int} index
* @returns {int} ID
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getHitAreaID = function (n) {
    if (this.json[this.HIT_AREAS] == null ||
        this.json[this.HIT_AREAS][n] == null)
        return null;

    return this.json[this.HIT_AREAS][n][this.ID];
}

/**
* @name getHitAreaName
* @desc get the hit area name of given index from json
* @param {int} index
* @returns {string} name
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getHitAreaName = function (n) {
    if (this.json[this.HIT_AREAS] == null ||
        this.json[this.HIT_AREAS][n] == null)
        return null;

    return this.json[this.HIT_AREAS][n][this.NAME];
}

/**
* @name getPhysicsFile
* @desc get physics file from json
* @param null
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getPhysicsFile = function () {
    return this.json[this.PHYSICS];
}

/**
* @name getPoseFile
* @desc get pose file from json
* @param null
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getPoseFile = function () {
    return this.json[this.POSE];
}

/**
* @name getExpressionNum
* @desc get the amount of expressions from json
* @param null
* @returns {int} amout
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getExpressionNum = function () {
    return (this.json[this.EXPRESSIONS] == null) ? 0 : this.json[this.EXPRESSIONS].length;
}

/**
* @name getExpressionFile
* @desc get expression file from json
* @param null
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getExpressionFile = function (n) {
    if (this.json[this.EXPRESSIONS] == null)
        return null;
    return this.json[this.EXPRESSIONS][n][this.FILE];
}

/**
* @name getExpressionName
* @desc get the hit expression name of given index from json
* @param {int} index
* @returns {string} name
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getExpressionName = function (n) {
    if (this.json[this.EXPRESSIONS] == null)
        return null;
    return this.json[this.EXPRESSIONS][n][this.NAME];
}

/**
* @name getLayout
* @desc get the layout from json
* @param null
* @returns {string} layout
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getLayout = function () {
    return this.json[this.LAYOUT];
}

/**
* @name getInitParamNum
* @desc get the amount of init parameter from json
* @param null
* @returns {int} amount
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getInitParamNum = function () {
    return (this.json[this.INIT_PARAM] == null) ? 0 : this.json[this.INIT_PARAM].length;
}

/**
* @name getMotionNum
* @desc get the amount of motions from json
* @param null
* @returns {int} amout
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getMotionNum = function (name) {
    if (this.json[this.MOTION_GROUPS] == null ||
        this.json[this.MOTION_GROUPS][name] == null)
        return 0;

    return this.json[this.MOTION_GROUPS][name].length;
}

/**
* @name getMotionFile
* @desc get motion file from json
* @param null
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getMotionFile = function (name, n) {
    if (this.json[this.MOTION_GROUPS] == null ||
        this.json[this.MOTION_GROUPS][name] == null ||
        this.json[this.MOTION_GROUPS][name][n] == null)
        return null;

    return this.json[this.MOTION_GROUPS][name][n][this.FILE];
}

/**
* @name getMotionSound
* @desc get motion's sound file from json
* @param null
* @returns {string} file path
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getMotionSound = function (name, n) {
    if (this.json[this.MOTION_GROUPS] == null ||
        this.json[this.MOTION_GROUPS][name] == null ||
        this.json[this.MOTION_GROUPS][name][n] == null ||
        this.json[this.MOTION_GROUPS][name][n][this.SOUND] == null)
        return null;

    return this.json[this.MOTION_GROUPS][name][n][this.SOUND];
}

/**
* @name getMotionFadeIn
* @desc get the motion's fade in setting from json
* @param {string} name, {int} index
* @returns {int} time (1000 if not found)
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getMotionFadeIn = function (name, n) {
    if (this.json[this.MOTION_GROUPS] == null ||
        this.json[this.MOTION_GROUPS][name] == null ||
        this.json[this.MOTION_GROUPS][name][n] == null ||
        this.json[this.MOTION_GROUPS][name][n][this.FADE_IN] == null)
        return 1000;

    return this.json[this.MOTION_GROUPS][name][n][this.FADE_IN];
}

/**
* @name getMotionFadeOut
* @desc get the motion's fade out setting from json
* @param {string} name, {int} index
* @returns {int} time (1000 if not found)
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getMotionFadeOut = function (name, n) {
    if (this.json[this.MOTION_GROUPS] == null ||
        this.json[this.MOTION_GROUPS][name] == null ||
        this.json[this.MOTION_GROUPS][name][n] == null ||
        this.json[this.MOTION_GROUPS][name][n][this.FADE_OUT] == null)
        return 1000;

    return this.json[this.MOTION_GROUPS][name][n][this.FADE_OUT];
}

/**
* @name getInitParamID
* @desc get the visible ID of init parameter from json
* @param {(int)} index
* @returns {int} ID
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getInitParamID = function (n) {
    if (this.json[this.INIT_PARAM] == null ||
        this.json[this.INIT_PARAM][n] == null)
        return null;

    return this.json[this.INIT_PARAM][n][this.ID];
}

/**
* @name getInitParamValue
* @desc get the visible value of init parameter from json
* @param {(int)} index
* @returns {int} value
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getInitParamValue = function (n) {
    if (this.json[this.INIT_PARAM] == null || this.json[this.INIT_PARAM][n] == null)
        return NaN;

    return this.json[this.INIT_PARAM][n][this.VALUE];
}

/**
* @name getInitPartsVisibleNum
* @desc get the amount of init parts visible from json
* @param null
* @returns {int} amout
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getInitPartsVisibleNum = function () {
    return (this.json[this.INIT_PARTS_VISIBLE] == null) ? 0 : this.json[this.INIT_PARTS_VISIBLE].length;
}

/**
* @name getInitPartsVisibleID
* @desc get the visible ID of init parts from json
* @param {(int)} index
* @returns {int} ID
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getInitPartsVisibleID = function (n) {
    if (this.json[this.INIT_PARTS_VISIBLE] == null || this.json[this.INIT_PARTS_VISIBLE][n] == null)
        return null;
    return this.json[this.INIT_PARTS_VISIBLE][n][this.ID];
}

/**
* @name getInitPartsVisibleValue
* @desc get the visible value of init parts from json
* @param {(int)} index
* @returns {int} value
* @memberOf ModelSettingJson
*/
ModelSettingJson.prototype.getInitPartsVisibleValue = function (n) {
    if (this.json[this.INIT_PARTS_VISIBLE] == null || this.json[this.INIT_PARTS_VISIBLE][n] == null)
        return NaN;

    return this.json[this.INIT_PARTS_VISIBLE][n][this.VALUE];
}
