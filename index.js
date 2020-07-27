const config = require("./config.json");
const FTPClient = require('ftp');
const mysql = require('mysql');
const fs = require("fs");
const d3DSV = require("d3-dsv");
const parser = d3DSV.dsvFormat(",");
const downloadFile = require('download-file');
const child_process = require("child_process");

const tmpPath = "./" + config.temp;
if (!fs.existsSync(tmpPath)) {
  fs.mkdirSync(tmpPath);
}

const dwnldPath = tmpPath + "/downloads";
if (!fs.existsSync(dwnldPath)) {
  fs.mkdirSync(dwnldPath);
}

/*----- MySQL to CSV -----*/

const mysqlConnection = mysql.createConnection({
  host : config.mysql.server,
  user : config.mysql.user,
  port : config.mysql.port,
  password : config.mysql.password,
  database : config.mysql.db.name
});
 
mysqlConnection.connect();

// Get all published posts, belonging to post_type "kioer_kw" and all metadata (see config)

const subqueries = config.mysql.post_meta.map((field) => {
  if (field === "mein_kw_bilder") {
    return `(SELECT subposts.guid FROM ${config.mysql.db.prefix}_posts AS subposts WHERE subposts.ID = (SELECT meta_value FROM ${config.mysql.db.prefix}_postmeta WHERE post_id = main.ID AND meta_key = "${field}")) AS ${field}`;
  } else {
    return `(SELECT GROUP_CONCAT(meta_value) FROM ${config.mysql.db.prefix}_postmeta WHERE post_id = main.ID AND meta_key = "${field}" GROUP BY post_id) AS ${field}`;
  }
}).join(",");

mysqlConnection.query(`SELECT 
main.ID AS id, main.post_title AS post_title, main.post_modified AS post_modified, main.guid AS guid, main.post_name AS post_name, 
  ${subqueries}
FROM 
  ${config.mysql.db.prefix}_posts AS main
WHERE 
main.post_status = "publish" 
AND main.post_type = "kioer_kw"
`, (error, results) => {

  if (error) throw error;
  processSQL(results);

  mysqlConnection.end();
});

// Process results and create a unified array

const processSQL = (results) => {
  const tempCSV = [];
  const tempKeys = ["id", "post_title", "post_modified", "guid", "post_name"];
 
  results.forEach((row) => {
    const csvRow = {
      id: row.id,
      post_title: row.post_title,
      post_modified: row.post_modified.getTime(),
      guid: row.guid,
      post_name: row.post_name
    };

    // get all clean fields
    config.mysql.post_meta.forEach((key) => {
      if (!(key in row) || key in row && (row[key] === null || row[key].length === 0)) {
        csvRow[key] = null;
        if (!tempKeys.includes(key)) {
          tempKeys.push(key);
        }
      } else if (!config.mysql.acf_parse.includes(key)) {
        csvRow[key] = row[key];
        if (!tempKeys.includes(key)) {
          tempKeys.push(key);
        }
      } else if (config.mysql.acf_parse.includes(key)) {
        // damn acf formatting
        // a:2:{i:0;s:8:"Skulptur";i:1;s:5:"Stele";}
        // a:1:{i:0;s:7:"Plastik";}
        // a:3:{s:7:"address";s:51:"Bleichröderpark, Schulstraße, Berlin, Deutschland";s:3:"lat";s:10:"52.5691394";s:3:"lng";s:17:"13.40709579999998";}
        const els = row[key].split("{")[1].split("}")[0].split(";");
        
        // special treatment for lists
        if (els[0].substring(0, 1) === "i") {
          const list = [];
          for (let i = 0; i < els.length; i += 2) {
            if (els[i] !== "" && els.length - 1 > i + 1) {
              const el = els[i + 1].split(":");
              list.push(el[el.length - 1].split('"').join(""));
            }
          }
          csvRow[key] = list;
          if (!tempKeys.includes(key)) {
            tempKeys.push(key);
          }
        } else {
          for (let i = 0; i < els.length; i += 2) {
            if (els[i] !== "" && els.length - 1 > i + 1) {
              const elKey = els[i].split(":");
              const elVal = els[i + 1].split(":");

              const eKey = elKey[elKey.length - 1].split('"').join("");
              csvRow[key + "_" + eKey] = elVal[elVal.length - 1].split('"').join("");
              if (!tempKeys.includes(key + "_" + eKey)) {
                tempKeys.push(key + "_" + eKey);
              }
            }
          }
        }
      } else {
        console.log("WHOOPSI");
      }
    });
    tempCSV.push(csvRow);
  });

  updateCSV(tempCSV, tempKeys);
};

const updateCSV = (rows, keys) => {
  let csv = keys.join(",");
  rows.forEach((row) => {
    const line = [];
    keys.forEach((key) => {
      if (!(key in row) || row[key] === null) {
        line.push("");
      } else if (typeof row[key] === "number") {
        line.push(row[key]);
      } else if (typeof row[key] === "object") {
        line.push(`"${row[key].join(",")}"`);
      } else if (row[key].indexOf(",") > -1) {
        line.push(`"${row[key]}"`);
      } else {
        line.push(row[key]);
      }
    });
    csv += "\n" + line.join(",");
  });
  fs.writeFileSync(tmpPath + "/temp.csv", csv, "utf8");
  downloadImages(rows);
};

const downloadImages = async (csv) => {
  for (let i = 0; i < csv.length; i += 1) {
    const extension = csv[i].mein_kw_bilder.split(".");
    let url = csv[i].mein_kw_bilder.replace("http://kioer.webhosting.hostingparadise.de/", "https://www.kunst-im-oeffentlichen-raum-pankow.de/").split("'").join("");
    const urlSplit = url.split("/");
    const urlFile = urlSplit[urlSplit.length - 1].split(".")[0];
    url = url.replace(urlFile, encodeURIComponent(urlFile));
    const fileName = csv[i].id + "." + extension[extension.length - 1];

    const options = {
      directory: dwnldPath,
      filename: fileName
    };
 
    const result = await download(options, url);
    console.log(result, url);
  }
  // transformImages(rows);
};

const download = (options, url) => {
  return new Promise((resolve, reject) => {
    downloadFile(url, options, (err) => {
      if (err) {
        resolve(null);
      }
      resolve(options.filename);
    });
  });
};

const transformImages = (rows) => {
  const s = fs.openSync(tmpPath + "/vikus-viewer-script.log", 'w');
  const p = child_process.spawn('node ./vikus-viewer-script/bin/textures.js', [dwnldPath], {stdio: [process.stdin, s, process.stderr]});
  p.on('close', (code) => {
    fs.closeSync(s);
  });
};

// https://www.kunst-im-oeffentlichen-raum-pankow.de/kioer_kw/${post_name}
// http://kioer.webhosting.hostingparadise.de/wp-content/uploads/2017/09/0110a_Russischer-Ofen.jpg
// https://www.kunst-im-oeffentlichen-raum-pankow.de/wp-content/uploads/2017/09/0110a_Russischer-Ofen.jpg

/*----- FTP Upload -----*/

// const uploads = [];
// let uploadIndex = 0;

// const ftpClient = new FTPClient();

// ftpClient.on('ready', () => {
//   upload();
// });

// ftpClient.connect({
//   host: config.ftp.server,
//   port: config.ftp.port,
//   secure: config.ftp.secure,
//   user: config.ftp.user,
//   password: config.ftp.password
// });

// const upload = () => {
//   if (uploadIndex < uploads.length - 1) {
//     ftpClient.put(`./temp/${uploads[uploadIndex]}`, `${config.ftp.folder}/${uploads[uploadIndex]}`, (err) => {
//       if (err) throw err;
//       uploadIndex += 1;
//       upload();
//     });
//   } else {
//     ftpClient.end();
//     // NEXT
//   }
// };