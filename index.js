/**
 * fis3-deploy-alioss
 * beth 修改
 * 添加自定义目录参数to
 * 过滤node_modules 和 modules参数
 */

var ALY = require("aliyun-sdk");
var mime = require('mime');
var aliyunoss = null;

function uploadOss(bucket, release, content, file,callback) {
  var subpath = file.subpath;
  var objkey = release.replace(/^\//, '');
  var contenttype = mime.lookup(release);

  aliyunoss.putObject({
    Bucket: bucket,
    Key: objkey,
    Body: content,
    AccessControlAllowOrigin: '',
    ContentType: contenttype,
    CacheControl: 'cache',         // 参考: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.9
    ContentDisposition: '',           // 参考: http://www.w3.org/Protocols/rfc2616/rfc2616-sec19.html#sec19.5.1
    ServerSideEncryption: '',
    Expires: new Date().getTime() + 1000*24*60*60*1000
  },function (err, data) {
      if(err){
        console.log('error:', err);
      } else {
        var time = '[' + fis.log.now(true) + ']';
        process.stdout.write(
            '\n' +
            ' uploadoss - '.green.bold +
            time.grey + ' ' +
            subpath.replace(/^\//, '') +
            ' >> '.yellow.bold +
            objkey + "---" + contenttype
        );
        callback();
      }
  });
}

/**
 * deploy-alioss 插件接口
 * @param  {Object}   options  插件配置
 * @param  {Object}   modified 修改了的文件列表（对应watch功能）
 * @param  {Object}   total    所有文件列表
 * @param  {Function} next     调用下一个插件
 * @return {undefined}
 */
module.exports = function(options, modified, total, callback, next) {
  if (!options.accessKey && !options.secretKey) {
    throw new Error('options.accessKey and options.secretKey is required!');
  } else if (!options.bucket) {
    throw new Error('options.bucket is required!');
  }
  var ossServer = options.ossServer ? options.ossServer : 'http://oss-cn-hangzhou.aliyuncs.com';
  aliyunoss = new ALY.OSS({
    "accessKeyId": options.accessKey,
    "secretAccessKey": options.secretKey,
    securityToken: "",
    endpoint: ossServer,
    apiVersion: '2013-10-15'
  });

  var steps = [];

  console.log('options', options);
  modified.forEach(function(file) {
    var reTryCount = options.retry;
    var releaseUrl = file.getHashRelease();

    if(releaseUrl.indexOf('node_modules') > -1 || releaseUrl.indexOf('modules') > -1){
      // console.log('不上传', releaseUrl);
    }else{
      
      steps.push(function(next) {
        var _upload = arguments.callee;
        
        uploadOss(options.bucket, options.to + file.getHashRelease(), file.getContent(), file, function(error){
          if (error) {
            if (!--reTryCount) {
              throw new Error(error);
            } else {
              _upload();
            }
          } else {
            next(); //由于是异步的如果后续还需要执行必须调用 next
          }
        });

      });
    }

  });
  steps.push(function(next) {
    console.log('\n已全部上传到AliyunOSS\n');
    next();
  });
  fis.util.reduceRight(steps, function(next, current) {
    return function() {
      current(next);
    };
  }, callback)();
};

module.exports.options = {
  // 允许重试两次。
  retry: 2
};
