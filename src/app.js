const cors = require("cors");
const express = require("express");
const bodyParser = require("body-parser");
const { rError } = require("./utils/respones");
const dotenv = require("dotenv");
const moment = require("moment-timezone");
const constants = require("./utils/constants");

const morgan = require("morgan");
const { GoogleSpreadsheet } = require("google-spreadsheet");

global.APP = __dirname;
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(morgan("dev"));

app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(bodyParser.json({ limit: "50mb" }));

app.get("/api/webhook", async (req, res) => {
  return res.status(200).json({ array: [] });
});

app.post("/api/webhook", async (req, res, next) => {
  try {
    const doc = new GoogleSpreadsheet(constants.SHEET_ID);

    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });

    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByIndex[0];
    const messageObject = {
      event: req.body?.event_name,
      userId: req.body?.sender?.id,
      message: req.body?.message?.text,
      timestamp: moment
        .tz(new Date(), "Asia/Ho_Chi_Minh")
        .format("DD/MM/YYYY , hh:mm A"),
    };

    if (req?.body?.event_name === "oa_send_text") {
      const messag = messageObject.message;
      var matches = messag.match(/\[(.*?)\]/);
      if (matches) {
        const sheetName = matches[1];
        const sheetCheckTime = doc.sheetsByTitle[sheetName];
        const result = messag.split(/\r?\n/);
        const map = {};
        result.forEach((row) => {
          const info = row.split(": ");
          if (info[1]) {
            map[info[0]] = info[1];
          }
        });
        await sheetCheckTime.addRow(map);
      }
    }

    if (
      req?.body?.event_name === "user_send_image" ||
      req?.body?.event_name === "oa_send_image" ||
      req?.body?.event_name === "oa_send_list"
    ) {
      var atts = req.body.message.attachments
        .map(function (a) {
          return a.payload.thumbnail;
        })
        .join("\r\n");
      await sheet.addRows([
        {
          ...messageObject,
          attachment: atts,
        },
      ]);
    }

    if (req.body.event_name === "user_send_location") {
      var location = req.body.message.attachments[0].payload.coordinates;
      await sheet.addRows([
        {
          ...messageObject,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      ]);
    }

    return res.status(200).json({ message: "webhook" });
  } catch (error) {
    next(error);
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const { message, code, subcode, errorItems, error } = err;

  return rError(
    res,
    code || 500,
    {
      message: message || "Something went wrong!",
      subcode,
      errorItems,
    },
    error
  );
});
app.listen(PORT, () => console.log(`App listening at port ${PORT}`));

module.exports = app;
