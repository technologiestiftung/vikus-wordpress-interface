# vikus-wordpress-interface
Create a CSV from an wordpress database, download images, transform them through the vikus-viewer-script and then upload to an FTP-server

**Deutsche Version unten**

## Overview
The [VIKUS Viewer](https://vikusviewer.fh-potsdam.de/) is an open source tool for presenting image collections (videos and audio can also be embedded). In order for the web-based system to run smoothly, the media needs to be optimized. This is done using the [VIKUS Viewer Scripts](https://github.com/cpietsch/vikus-viewer-script). This repository holds a script that imports media and metadata managed in a wordpress instance using [Advanced Custom Fields (ACF)](https://www.advancedcustomfields.com/).

### Process
1. A MySQL query collects all required meta data from the wordpress database.
2. The metadata csv for the VIKUS Viewer is being generated.
3. The images are being downloaded to a local folder.
4. The VIKUS Viewer Scripts transform the images.
5. The new/updated data is automatically uploaded to a webserver destination. 

## Requirements
You need to have [Node.js](https://nodejs.org/) installed.

## Configuration
This is the most important and tricky part of the process. Duplicate config-sample.json and rename to config.json. Now start editing the config file and add your information:

### Database connection
This should be the same as your wp-config.php file:
```json
"server": "localhost",
"port": 1234,
"user": "",
"password": "",
"db": {
  "name": "",
  "prefix": ""
}
```

### Advanced Custom fields
The wordpress setup should be a custom type, with additional meta-data managed through ACF. In order for the script to know what to export, we need to map the ACF-fields to the VIKUS-fields:
```json
"custom_type": "VIKUS_ASSET_TYPE",
"post_meta": [
  "META_KEYS"
],
"acf_parse":[
  "KEYS_WITH_SPECIAL_ACF_SYNTAX"
],
"transformation":[
  ["data.csv-KEY", "KEY_FROM_ABOVE"]
],
"taxonomies": [
  ["TAXONOMY_KEY", "TITLE_OF_TAXONOMY_FOR_GUI"]
],
"primary": "id",
"year": {
  "column":"META_KEY_WITH_YEAR",
  "na": "k.A."
}
```
- **custom_type**: As defined in functions.php (or plugin)
- **post_meta**: Which attributes to export from the post_meta table
- **acf_parse**: Which acf_fields to export
- **transformation**: Database keys can be generic, so here we can transform the keys to proper names (suggestion: use lower case, no special characters)
- **taxonomies**: Vikus viewer allows taxonomy-based filtering, define which taxonomies to export
- **primary**: Primary id, likely id
- **year**: Which key holds the year. What is the value for media with no date (k.A., NULL, etc.)

### FTP Server
Where should the resulting data be uploaded to:
```json
"ftp": {
  "server": "",
  "port": 1234,
  "user": "",
  "password": "",
  "folder": "",
  "secure": false
}
```

### Temp Folder
Name of the temporary folder created in the repo folder, probably leave as is...
```json
"temp":"temp"
```

## Setup
Open your terminal. Go to the folder of this repository...
```bash
cd vikus-wordpress-interface
npm run install
```
If you want to make sure the most important bits of your config are correct run:
```bash
npm run test
```

## Running
Once everything is installed you only need to run the following command to update everything:
```bash
npm run update
```

### Force an update
The system checks if anything in the metadata has changed. If nothing has changed the script will not run an update and inform you about it. If you are sure something changed. For example if an image was replaced, the system might not notice that. Then you can force an update by running:
```bash
npm run force
```

## Running on a server
The script was build to be run locally, but obviously you could also run it on a server, activate it through a cron-job and keep your VIKUS Viewer up to date. But this requires you to have Node.js installed on your server, which most people don't have.

------

**English version see above**

## Overview
Der [VIKUS Viewer](https://vikusviewer.fh-potsdam.de/) ist ein Open Source Werkzeug um große Bildsammlungen zu präsentieren (Videos und Audio können auch eingebettet werden). Damit das web-basierte Werkzeug flüssig läuft, müssen die Medien vorher optimiert werden. Dies kann mit den [VIKUS Viewer Scripts](https://github.com/cpietsch/vikus-viewer-script) durchgeführt werden. Dieses Repository hier, enthält ein zusätzliches Script, welches einem erlaubt Daten und Medien zu importieren, welche durch eine Wordpress-Instanz mit [Advanced Custom Fields (ACF)](https://www.advancedcustomfields.com/) verwaltet werden.

### Prozess
1. Über eine MySQL-Query werden die notwendigen Information aus der Wordpress-Datenbank geladen.
2. Die Metadaten-CSV für den VIKUS-Viewer wird generiert.
3. Die Bilder werden in einen lokalen Ordner heruntergeladen.
4. Das VIKUS Viewer Script wandelt die Bilder um.
5. Die neuen Daten werden auf einen Webserver hochgeladen. 

## Voraussetzungen
Man muss lokal [Node.js](https://nodejs.org/) installieren.

## Configuration
Dies ist der wichtigste und etwas kniffelige Teil. Hierfür dupliziert man zuerst die config-sample.json und benennt sie in config.json um. Nun müssen die eigenen Informationen eingetragen werden:

### Datenbankverbindung
Dies sollte die selbe Verbindung sein, wie sie auch in wp-config.php definiert ist:
```json
"server": "localhost",
"port": 1234,
"user": "",
"password": "",
"db": {
  "name": "",
  "prefix": ""
}
```

### Advanced Custom fields
Das Wordpress-Setup sollte so aufgesetzt sein, dass die Medien über einen "custom-type" verwaltet werden, zusätzliche Metadaten werden über ACF administriert. Damit das Script funktioniert muss definiert werden, welche Felder exportiert werden und wie diese auf den Vikus-Viewer gemappt werden:
```json
"custom_type": "VIKUS_ASSET_TYPE",
"post_meta": [
  "META_KEYS"
],
"acf_parse":[
  "KEYS_WITH_SPECIAL_ACF_SYNTAX"
],
"transformation":[
  ["data.csv-KEY", "KEY_FROM_ABOVE"]
],
"taxonomies": [
  ["TAXONOMY_KEY", "TITLE_OF_TAXONOMY_FOR_GUI"]
],
"primary": "id",
"year": {
  "column":"META_KEY_WITH_YEAR",
  "na": "k.A."
}
```
- **custom_type**: Wie in functions.php definiert (oder Plugin)
- **post_meta**: Welche Attribute sollen aus der post_meta exportiert werden.
- **acf_parse**: Welche acf_fields Attribute sollen exportiert werden.
- **transformation**: Datenbank-Attribute können sehr generisch sein, deshalb kann man diese hier in lesbare Namen umbenennen (Empfehlung: englisch, klein geschrieben, keine Spezialzeichen)
- **taxonomies**: Der Vikus Viewer erlaubt basierend auf Taxonomien zu filtern, welche Taxonomie export wird kann hier definiert werden
- **primary**: Primary id, sehr wahrscheinlich id
- **year**: Welches Attribute beinhaltet das Jahr. Und welcher Wert wird bei Medien ohne Jahresangabe angegeben (k.A., NULL, etc.)

### FTP Server
Wohin sollen die fertigen Daten hochgeladen werden:
```json
"ftp": {
  "server": "",
  "port": 1234,
  "user": "",
  "password": "",
  "folder": "",
  "secure": false
}
```

### Temporärer Order
Name des temporären Ordners der erstellt wird:
```json
"temp":"temp"
```

## Setup
Das Terminal/CMD öffnen und in den entsprechenden Ordner wechseln und Dependencies installieren...
```bash
cd vikus-wordpress-interface
npm run install
```
Um sicher zu gehen, dass die wichtigsten Angaben in der Config korrekt sind, folgendes ausführen:
```bash
npm run test
```

## Ausführen
Wenn alles fertig aufgesetzt ist, muss nur noch folgender Befehl ausgeführt werden:
```bash
npm run update
```

### Update erzwingen
Das System überprüft automatisch ob sich etwas verändert hat. Manchmal, z.B. wenn ein Bild manuell im System ausgetauscht wurde, merkt das System nicht das sich etwas verändert hat. Dann kann man ein Update auch mit folgendem Befehl erzwingen:
```bash
npm run force
```

## Auf einem Server ausführen
Das Script wurde für die lokale Ausführung entwickelt, es kann aber selbstverständlich auch auf einem Server ausgeführt werden und z.B. regelmäßig mit einem CRON-Job aktiviert werden. Dies macht es aber notwendig, dass Node.js auf dem Server installiert ist. Was auf den meisten Servern nicht der Fall ist.
