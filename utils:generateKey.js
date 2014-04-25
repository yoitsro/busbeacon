var readline = require('readline');
var crypto = require('crypto');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var generate = function() {
    var date = new Date();

    var apiKey = 'Q9CASFDTCUS6D13FHGA5HSZFI';
    var dateString = date.getFullYear().toString() + '0' + (date.getMonth() + 1).toString() + date.getDate().toString() + date.getHours().toString();

    apiKey += dateString;

    console.log(apiKey);

    var hash = crypto.createHash('md5').update(apiKey).digest('hex');

    rl.question("", function() {


        console.log(hash); 

        generate();
    });
};

generate();