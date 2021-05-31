var cron = require('node-cron');
var Emailer = require('./email');
cron.schedule('*/5 * * * *', () => {
    // Emailer(); 
    console.log("Successful query")
  }, {
     scheduled: true,
    timezone: 0
   });
  //  Emailer(); 
  console.log(new Date().toLocaleDateString())