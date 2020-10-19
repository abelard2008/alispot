const util = require('./utils')
const path = require('path')
const fs = require('fs')
const { forwardjs } = require('./forward')

const log = util.log

async function sshC() {
    console.log("oooooo")
}

async function main () {
  try {
    let config = util.config
    let client = util.client
    let rawdata = fs.readFileSync('ip-password.json');
    let ip_password = JSON.parse(rawdata);
    console.log('ip ' + ip_password.ip);
    let ECS = util.ECS
    const sshParams = {
        host: ip_password.ip,
        port: 22,
        username: 'root',
        password: ip_password.password
    }
    let params = {
      RegionId: ECS.RegionId,
      NetworkType: 'vpc',
      InstanceType: ECS.InstanceType
    }
    // let conn = await sshC()
    let conn = await util.sshConnect(sshParams)
    log.info('SSH已连接；开始启用GoogleBBR...')
    start = Date.now()
   await util.sshExec(conn, 'wget --no-check-certificate https://github.com/rockswang/alispot/raw/master/bbr.sh && chmod +x bbr.sh && ./bbr.sh')
    try {conn.end()} catch (err) {}
     log.info('GoogleBBR已启用，耗时约%s ms；系统重启...', (Date.now() - start))

    start = Date.now()
    result = await util.statusCheck(client, 'DescribeInstances', params, 10000, 5000, 20, r => r.Instances.Instance[0].Status === 'Running')
    log.debug({ result }, 'DescribeInstances')
    log.info('实例已重启，耗时约%s ms', (Date.now() - start))

    conn = await util.sshConnect(sshParams)
    log.info('SSH已重新连接；开始安装SSR Server...')
//    await util.sshExec(conn, 'rm -f /etc/yum.repos.d/CentOS-Base.repo')
    await util.sshExec(conn, 'curl -o /etc/yum.repos.d/CentOS-Base.repo http://mirrors.aliyun.com/repo/Centos-7.repo')
    await util.sshExec(conn, 'yum clean all;yum makecache')
    await util.sshExec(conn, 'yum install git -y')
    await util.sshExec(conn, 'git clone -b manyuser https://github.com/shadowsocksr-backup/shadowsocksr.git')
    //await sshExec(conn, 'wget https://codeload.github.com/shadowsocksr-backup/shadowsocksr/zip/manyuser')
    const ssr = config.ssr_server
    let args = `-p ${ssr.port} -k '${ssr.password}' -m '${ssr.method}' -O '${ssr.protocol}' -o '${ssr.obfs}'`
    if (ssr.protocol_param) args += ` -G '${ssr.protocol_param}'`
    if (ssr.obfs_param) args += ` -g '${ssr.obfs_param}'`
    await util.sshExec(conn, `nohup python shadowsocksr/shadowsocks/server.py ${args} >> /dev/null 2>&1 &`)
    try { conn.end() } catch (err) { }
    log.info('SSR服务端已启动')
    log.info('===== SSR客户端配置信息 =====')
    log.info('  服务器IP: %s', ip_password.ip)
    log.info('  服务器端口: %s', ssr.port)
    log.info('  密码: %s', ssr.password)
    log.info('  加密: %s', ssr.method)
    log.info('  协议: %s', ssr.protocol)
    log.info('  协议参数：%s', ssr.protocol_param || '无')
    log.info('  混淆: %s', ssr.obfs)
    log.info('  混淆参数: %s', ssr.obfs_param || '无')
    log.info('===== SSH连接信息 =====')
    log.info('  IP：%s: ', ip_password.ip)
    log.info('  端口: 22')
    log.info('  操作系统账户: root')
    log.info('  操作系统密码: %s', ip_password.password)
    log.info('===== 本地端口转发 =====')
    log.info('  正在监听端口：%s', ssr.port)
    forwardjs(['' + ssr.port, `${ip_password.ip}:${ssr.port}`])
  } catch (error) {
    log.fatal(error)
  }
}
main()
