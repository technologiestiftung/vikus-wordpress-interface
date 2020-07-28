const config = require("./config.json");
const FTPClient = require('ftp');
const mysql = require('mysql');
const fs = require("fs");
const d3DSV = require("d3-dsv");
const parser = d3DSV.dsvFormat(",");
const downloadFile = require('download-file');
const shell = require("shelljs");

console.log("✅ All required packages are installed.");

/*----- Test MySQL Connection -----*/

try {
  const mysqlConnection = mysql.createConnection({
    host : config.mysql.server,
    user : config.mysql.user,
    port : config.mysql.port,
    password : config.mysql.password,
    database : config.mysql.db.name
  });
  
  mysqlConnection.connect();
  mysqlConnection.end();

  console.log("✅ MySQL Connection established");
} catch (err) {
  console.log("❌ Please check the MySQL configuration", err);
}

/*----- Test FTP Connection -----*/

try {
  const ftpClient = new FTPClient();

  ftpClient.on('ready', () => {
    ftpClient.end();
    console.log("✅ FTP Connection established");
  });

  ftpClient.connect({
    host: config.ftp.server,
    port: config.ftp.port,
    secure: config.ftp.secure,
    user: config.ftp.user,
    password: config.ftp.password
  });

} catch (err) {
  console.log("❌ Please check the FTP configuration", err);
}