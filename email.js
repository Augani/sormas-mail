require("dotenv").config();
const { Client } = require("pg");
const Template = require("./emailTemplate");
var nodemailer = require("nodemailer");
const toCsv = require("to-csv");
const QUERY = `
SELECT TO_CHAR(t.testdatetime, 'dd-mm-yyyy') as "Time of Result",t.testeddisease as "Tested Disease", t.testtype as "Test Type", s.uuid as "Sample ID", concat(lu.firstname,' ', lu.lastname) as "Results Entered by", f.name as "Laboratory", c.district_id, v.name as "District" FROM  pathogentest t INNER JOIN samples s ON t.sample_id = s.id INNER JOIN cases c  ON s.associatedcase_id = c.id  INNER JOIN person p ON p.id  = c.person_id INNER JOIN facility f ON f.id  = t.lab_id INNER JOIN users lu ON t.labuser_id = lu.id INNER JOIN district v ON c.district_id = v.id  WHERE  DATE(t.testdatetime) = CURRENT_DATE`;
const CCQUERY = `
Select users.useremail, u.name from users INNER JOIN users_userroles h on users.id = h.user_id INNER JOIN district u ON users.district_id = u.id where h.userrole = 'DISTRICT_OBSERVER' AND district_id =
`;
var transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

async function getClient() {
  const client = new Client({
    user: process.env.USER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: 5432,
  });
  try {
    await client.connect();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
  return client;
}
async function getResults(q) {
  let client = await getClient();
  let res = await client.query(q);
  await client.end();
  return res.rows;
}

function refineList(data) {
  let users = {};
  for (let y = 0; y < data.length; y++) {
    if (users[data[y].district_id]) continue;
    users[data[y].district_id] = data.filter(
      (p) => data[y].district_id === p.district_id
    );
  }
  return users;
}

async function getCCs(dist) {
  let sups = await getResults(`${CCQUERY} ${dist}`);
  if(sups.length){
    if(!sups[0].name)return [[], "No surveillance supervisor"]
  }else {
    return [[], "No surveillance supervisor"]
  }
  return [sups.length ? sups.map((l) => l.useremail) : null, sups[0].name];
}

async function sendMail() {
  let results = await getResults(QUERY);
  if (!results || !results.length) {
    console.log("No data for ", new Date().toDateString());
    return;
  }
  let districts = refineList(results);
  for (let dist in districts) {
    let details = districts[dist];
    details = details.map((f) => {
      delete f.district_id;
      return f;
    });
    let [CCs, districtName] = await getCCs(dist);
    if(!CCs.length){
      console.log(districtName)
      return;
    }
    let parseData = toCsv(details);
    let htmlTemplate = Template(districtName);
    var mailOptions = {
      from: '"SORMAS" <mail.surveillancegh.org>',
      to: process.env.EMAIL,
      subject: "SORMAS - Results for today",
      html: htmlTemplate,
      cc: CCs && CCs.length ? CCs : null,
      attachments: {
        filename: "results.csv",
        content: parseData,
        contentType: "text/csv",
      },
    };
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        return console.log(error);
      }
      console.log("Message sent: " + info.response);
    });
  }
}

module.exports = sendMail;
