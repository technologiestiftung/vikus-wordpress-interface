const config = require("./config.json");
const FTPClient = require('ftp');
const mysql = require('mysql');
const fs = require("fs");
const d3DSV = require("d3-dsv");
const parser = d3DSV.dsvFormat(",");
const downloadFile = require('download-file');
const shell = require("shelljs");

const terminalUpdate = (msg) => {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(msg);
};

process.stdout.write("\n");
process.stdout.write("💬 Setup");

const tmpPath = "./" + config.temp;
if (!fs.existsSync(tmpPath)) {
  fs.mkdirSync(tmpPath);
}

const dwnldPath = tmpPath + "/downloads";
if (!fs.existsSync(dwnldPath)) {
  fs.mkdirSync(dwnldPath);
}

/*----- MySQL to CSV -----*/

terminalUpdate("💬 Wordpress MySQL Call");

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
AND main.post_type = "${config.mysql.custom_type}"
`, (error, results) => {

  if (error) throw error;
  processSQL(results);

  mysqlConnection.end();
});

// Process results and create a unified array

const processSQL = (results) => {
  terminalUpdate("💬 Processing data");
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
  let oldCsv = [];
  if (fs.existsSync(tmpPath + "/temp.csv")) {
    const rawCsv = fs.readFileSync(tmpPath + "/temp.csv", "utf8");
    oldCsv = parser.parse(rawCsv);
  }

  let newCsv = [];

  preparedRows = prepareCSV(rows, keys);

  // Check which rows are new / deleted / modified > ignore others
  preparedRows.forEach((row) => {
    let isModified = true;
    oldCsv.forEach((oRow) => {
      if (row[config.mysql.primary].toString() === oRow[config.mysql.primary].toString()) {
        isModified = false;
        keys.forEach((key) => {
          if (key in row && key in oRow && (oRow[key] !== null || row[key] !== null)) {
            if ((row[key] === null && oRow[key] !== null) || (row[key] !== null && oRow[key] === null)) {
              isModified = true;
            } else if (row[key].toString() !== oRow[key].toString()) {
              isModified = true;
            }
          }
        });
      }
    });
    if (isModified) {
      newCsv.push(row);
    }
  });

  writeCSV(preparedRows, keys, tmpPath + "/temp.csv");

  if (newCsv.length === 0 && process.argv[2] !== "force") {
    process.stdout.write("\n");
    process.stdout.write("‼ Looks like nothing changed, if you wish to still run an update, please use 'npm run force'");
  } else {
    if (process.argv[2] === "force") {
      newCsv = preparedRows;
    }

    transformCsv(preparedRows);

    terminalUpdate("🐓 Wordpress to CSV complete");
    process.stdout.write("\n");
    process.stdout.write("💬 downloading images");

    downloadImages(newCsv);
  }
};

const escapeQuote = (text) => {
  return text.split(`"`).join(`""`);
};

const prepareCSV = (rows, keys) => {
  terminalUpdate("💬 Consolidating data");
  const newRows = [];
  rows.forEach((row) => {
    const newRow = {};
    keys.forEach((key) => {
      if (!(key in row) || row[key] === null) {
        newRow[key] = "";
      } else if (typeof row[key] === "number") {
        newRow[key] = row[key];
      } else if (typeof row[key] === "object") {
        newRow[key] = `${row[key].join(",")}`;
      } else {
        newRow[key] = row[key];
      }
    });
    newRows.push(newRow);
  });
  return newRows;
};

const writeCSV = (rows, keys, target) => {
  terminalUpdate("💬 Consolidating data");
  let csv = keys.join(",");
  rows.forEach((row) => {
    const line = [];
    keys.forEach((key) => {
      if (row[key].toString().indexOf(",") > -1 || row[key].toString().indexOf(`"`) > -1) {
        line.push(`"${escapeQuote(row[key])}"`);
      } else {
        line.push(row[key]);
      }
    });
    csv += "\n" + line.join(",");
  });
  fs.writeFileSync(target, csv, "utf8");
};

const transformCsv = (rows) => {
  const data = [];

  rows.forEach((row) => {
    const newRow = {};
    config.mysql.transformation.forEach((trans) => {
      newRow[trans[0]] = row[trans[1]];
    });

    const tYear = row[config.mysql.year.column].match(/\d{4}/);
    if (tYear === null) {
      newRow["year"] = config.mysql.year.na;
    } else {
      newRow["year"] = parseInt(tYear[0]);
    }

    let taxonomy = [];
    config.mysql.taxonomies.forEach((tax) => {
      const values = row[tax[0]].split(",");
      values.forEach((value) => {
        taxonomy.push(`${tax[1]}:${value}`);
      });
    });
    newRow["keywords"] = taxonomy.join(",");

    data.push(newRow);
  });

  writeCSV(data, [...config.mysql.transformation.map((values) => values[0]), "year", "keywords"], tmpPath + "/data.csv");
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
    terminalUpdate(`💬 downloading images ${csv.length} / ${(i + 1)}`);
  }

  terminalUpdate("🐈 Image download complete");
  process.stdout.write("\n");
  process.stdout.write("💬 transforming images");

  transformImages(csv);
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
  const { stdout, stderr, code } = shell.exec(`node ./vikus-viewer-script/bin/textures.js "${dwnldPath}/*.jpg"`, { silent: true });
  fs.writeFileSync("./vikus-viewer-script/log/stdout.txt", stdout, "utf8");
  fs.writeFileSync("./vikus-viewer-script/log/stderr.txt", stderr, "utf8");
  fs.writeFileSync("./vikus-viewer-script/log/code.txt", code, "utf8");

  terminalUpdate("🐕 Image transformation complete");
  process.stdout.write("\n");
  process.stdout.write("💬 uploading images");

  uploadImages(rows);
};

// https://www.kunst-im-oeffentlichen-raum-pankow.de/kioer_kw/${post_name}
// http://kioer.webhosting.hostingparadise.de/wp-content/uploads/2017/09/0110a_Russischer-Ofen.jpg
// https://www.kunst-im-oeffentlichen-raum-pankow.de/wp-content/uploads/2017/09/0110a_Russischer-Ofen.jpg

/*----- FTP Upload -----*/

const uploadImages = (rows) => {
  const uploads = [["./temp/data.csv", "data/data.csv"]];
  const folders = ["1024", "4096", "sprites"];

  folders.forEach((folder, fi) => {
    fs.readdirSync(`./data/${folder}/`).forEach(file => {
      if (file.indexOf(".jpg") > -1 || file.indexOf(".json") > -1) {
        let doUpload = true;
        if (fi < 2) {
          doUpload = false;
          rows.forEach((row) => {
            if (row[config.mysql.primary].toString() === file.split(".jpg")[0].toString()) {
              doUpload = true;
            }
          });
        }
        if (doUpload) {
          uploads.push([`./data/${folder}/${file}`, `temp/${folder}/${file}`]);
        }
      }
    });
  });

  let uploadIndex = 0;

  const ftpClient = new FTPClient();

  ftpClient.on('ready', () => {
    upload();
  });

  ftpClient.connect({
    host: config.ftp.server,
    port: config.ftp.port,
    secure: config.ftp.secure,
    user: config.ftp.user,
    password: config.ftp.password
  });

  const upload = () => {
    if (uploadIndex <= uploads.length - 1) {
      ftpClient.put(`${uploads[uploadIndex][0]}`, `${config.ftp.folder}${uploads[uploadIndex][1]}`, (err) => {
        if (err) throw err;
        uploadIndex += 1;
        terminalUpdate(`💬 uploading images ${uploads.length} / ${(uploadIndex + 1)}`);
        upload();
      });
    } else {
      ftpClient.end();
      terminalUpdate("🦓 Upload Complete");
      process.stdout.write("\n");
      process.exit();
    }
  };
};