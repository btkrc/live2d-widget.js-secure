
/**
 *
 *  You can modify and use this source freely
 *  only for the development of application related Live2D.
 *
 *  (c) Live2D Inc. All rights reserved.
 */

// Modified by xiazeyu.

// Modified by zekalryn（李晟赫）, 2026-11-17

/**
* @desc A library that provide basic IO and json function
*/

import { currWebGL } from './elementMgr';
import { Live2DModelWebGL } from "./lib/live2d.core";


//============================================================
//============================================================
//  class PlatformManager     extend IPlatformManager
//============================================================
//============================================================

/**
* @name PlatformManager
* @desc Define the variable type of PlatformManager
* @param null
* @returns {Structure} PlatformManager
*/
export function PlatformManager() {

}


//============================================================
//    PlatformManager # loadBytes()
//============================================================

/**
* @name loadBytes
* @desc load bytes from the path and callback
* @param {String} path, {Function} callback
* @returns callback {raw} context
* @memberOf PlatformManager
*/

PlatformManager.prototype.loadBytes = function (path/*String*/, callback) {
    var request = new XMLHttpRequest();
    request.open("GET", path, true);
    request.responseType = "arraybuffer";
    //  超时保护：请求挂死时不让模型永远停留在"加载中"状态
    //  （moc 约 450KB，弱网下放宽到 30s，可按需调整）
    request.timeout = 30000;

    request.onload = function () {
        switch (request.status) {
            case 200:
                //  统一兜底：回调内部的解析异常不再冒泡成未捕获错误
                //  （原实现里 JSON.parse 一抛错就会静默中断整条加载链）
                try {
                    callback(request.response);
                } catch (err) {
                    console.error("[Live2D] 资源解析失败 : " + path, err);
                }
                break;
            default:
                console.error("Failed to load (" + request.status + ") : " + path
                    + (request.status === 0
                        ? "，status=0 通常表示被浏览器跟踪防护 / 扩展拦截或跨域失败"
                        : ""));
                break;
        }
    }

    //  网络层失败（跟踪防护、广告拦截、断网时走这里）
    request.onerror = function () {
        console.error("[Live2D] 资源请求被中断，请检查浏览器跟踪防护 / 扩展拦截 : " + path);
    };

    request.ontimeout = function () {
        console.error("[Live2D] 资源请求超时 : " + path);
    };

    request.send(null);
    // return request;
}


//============================================================
//    PlatformManager # loadString()
//============================================================

/**
* @name loadString
* @desc load bytes from the path and put it into buffer
* @param {String} path
* @returns buffer {raw} context
* @memberOf PlatformManager
*/
PlatformManager.prototype.loadString = function (path/*String*/) {

    this.loadBytes(path, function (buf) {
        return buf;
    });

}


//============================================================
//    PlatformManager # loadLive2DModel()
//============================================================

/**
* @name loadLive2DModel
* @desc load Live2DModel from the path and put it into buffer
* @param {String} path, {function} callback
* @returns callback loaded model
* @memberOf PlatformManager
*/
PlatformManager.prototype.loadLive2DModel = function (path/*String*/, callback) {
    var model = null;

    // load moc
    this.loadBytes(path, function (buf) {

        // =================  模型解密逻辑 =================
        //  替换为你自己的密钥字符串
        var _sec = "_YOU_SECURE_KEY_!";

        //  假头长度（32 字节 PNG 尾块伪装）
        var _headerLen = 32;

        try {
            if (!buf || typeof buf.byteLength !== "number" || buf.byteLength <= _headerLen) {
                console.error("[Live2D] moc 数据为空或长度异常，已跳过加载 : " + path);
                return;
            }

            var _raw = new Uint8Array(buf);
            var _dataLen = _raw.length - _headerLen;
            var _dec = new Uint8Array(_dataLen);

            // 解密算法：多字节流 XOR 与动态移位
            for (var i = 0; i < _dataLen; i++) {
                var _kb = _sec.charCodeAt(i % _sec.length);
                var _mix = _raw[i + _headerLen];

                _dec[i] = _mix ^ _kb ^ (i & 0xFF);
            }
            // =======================================================

            // 调试代码
            // console.log(" 模型解密后大小:", _dec.length);

            model = Live2DModelWebGL.loadModel(_dec.buffer);

            if (!model) {
                //  解密成功但 core 解析不了：密钥 / 假头长度不匹配，或 moc 版本不兼容
                console.error("[Live2D] moc 解密后无法解析，请检查密钥与假头长度 : " + path);
                return;
            }
        } catch (err) {
            //  不让异常冒泡，避免 moc 加载失败时整个初始化链静默中断
            console.error("[Live2D] moc 加载异常 : " + path, err);
            return;
        }

        callback(model);
    });
}


//============================================================
//    PlatformManager # loadTexture()
//============================================================

/**
* @name loadTexture
* @desc load Live2DModel's Texture and callback
* @param {Live2DModelWebGL}model, {int}no, {string}path, {function}callback
* @returns callback
* @memberOf PlatformManager
*/
PlatformManager.prototype.loadTexture = function (model/*ALive2DModel*/, no/*int*/, path/*String*/, callback) {
    // load textures
    var loadedImage = new Image();
    // Thanks to @mashirozx & @fghrsh
    // Issues:
    // @https://github.com/journey-ad/live2d_src/issues/1
    // @https://github.com/journey-ad/live2d_src/issues/3
    loadedImage.crossOrigin = 'Anonymous';

    // var thisRef = this;
    loadedImage.onload = function () {
        // create texture
        var gl = currWebGL;
        var texture = gl.createTexture();
        if (!texture) { console.error("Failed to generate gl texture name."); return -1; }

        if (!model.isPremultipliedAlpha()) {
            // 乗算済アルファテクスチャ以外の場合
            // emmmm, maybe do something for textures with alpha layer.
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
            gl.UNSIGNED_BYTE, loadedImage);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
        gl.generateMipmap(gl.TEXTURE_2D);



        model.setTexture(no, texture);

        // テクスチャオブジェクトを解放
        // Release the texture object to prevent buffer overruns.
        texture = null;

        if (typeof callback == "function") callback();
    };

    loadedImage.onerror = function () {
        console.error("[Live2D] 贴图加载失败，模型可能显示异常 : " + path);
        //  兜底回调：贴图失败时不阻塞整条初始化链，避免模型永远处于"加载中"
        if (typeof callback == "function") callback();
    }

    //  注意：src 必须放在事件绑定之后
    //  否则图片命中缓存时 onload 可能先于绑定触发，纹理永远不会被创建
    loadedImage.src = path;
}


//============================================================
//    PlatformManager # parseFromBytes(buf)

//============================================================

/**
* @name jsonParseFromBytes
* @desc parse json file into arrays
* @param {raw} buf
* @returns {Array}jsonObj
* @memberOf PlatformManager
*/
PlatformManager.prototype.jsonParseFromBytes = function (buf) {
    var jsonStr = "";

    try {
        if (!buf || typeof buf.byteLength !== "number" || buf.byteLength === 0) {
            console.error("[Live2D] json 数据为空，疑似被浏览器跟踪防护或扩展拦截");
            return {};
        }

        var bytes = new Uint8Array(buf);

        //  跳过 UTF-8 BOM
        if (bytes.length >= 3 && bytes[0] == 239 && bytes[1] == 187 && bytes[2] == 191) {
            bytes = bytes.subarray(3);
        }

        if (typeof TextDecoder !== "undefined") {
            jsonStr = new TextDecoder("utf-8").decode(bytes);
        } else {
            //  回退：逐字节拼接，避免 String.fromCharCode.apply 在长文本上爆栈
            for (var i = 0; i < bytes.length; i++) {
                jsonStr += String.fromCharCode(bytes[i]);
            }
        }

        return JSON.parse(jsonStr);
    } catch (err) {
        //  返回空对象而不是 null：
        //  下游（physics/pose）取属性时会走 loadBytes 的兜底 catch，模型降级为"无物理/无姿态"继续渲染
        console.error("[Live2D] json 解析失败", err, " | 内容预览: " + String(jsonStr).substring(0, 40));
        return {};
    }
};



//============================================================
//    PlatformManager # log()
//============================================================

/**
* @name log
* @desc output log in console
* @param {string} txt
* @returns null
* @memberOf PlatformManager
*/
PlatformManager.prototype.log = function (txt/*String*/) {
    console.log(txt);
}
