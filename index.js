var Hapi     = require('hapi');
var Joi = require('joi');
var Request = require('request');
var Crypto = require('crypto');
var Async = require('async');

var API_KEY = process.env.API_KEY;
var BASE_URL = 'http://ws.mybustracker.co.uk/?module=json&key=';

var config = {
    hostname: 'localhost',
    port: +process.env.PORT || 9001
};

var routes = {};

var api = {};


api.getBusTimes = function(options, callback) {
    var path = 'function=getBusTimes';

    if(options.stopId) {
        path += '&stopId=' + options.stopId.toString();
    }

    if(options.stopId1) {
        path += '&stopId1=' + options.stopId1.toString();
    }

    if(options.refDest) {
        path += '&refDest=' + options.refDest.toString(); 
    }
    console.log(getBaseURL() + path);
    Request(getBaseURL() + path, function (error, response, body) {
        callback(error, JSON.parse(body));
    });
};

api.getJourneyTimes = function(stopId, journeyId, callback) {
    var path = 'function=getJourneyTimes';

    if(stopId) {
        path += '&stopId=' + stopId.toString();
    }

    if(journeyId) {
        path += '&journeyId=' + journeyId.toString();
    }

    console.log(getBaseURL() + path);
    Request(getBaseURL() + path, function (error, response, body) {
        callback(error, JSON.parse(body));
    });
};




var getDestinationRefDest = function(stopId, destinationStopId, callback) {
    api.getBusTimes({
        stopId: destinationStopId
    }, function(err, data) {
        if(err) {
            return callback(err);
        }

        callback(null, stopId, data.busTimes[0].timeDatas[0].refDest);
    });
};

var getJourneyIds = function(stopId, refDest, callback) {
    api.getBusTimes({
        stopId1: stopId,
        refDest: refDest
    }, function(err, data) {
        if(err) {
            return callback(err);
        }

        var journeyIds = [];

        data.busTimes.forEach(function(busTime) {
            busTime.timeDatas.forEach(function(timeData) {
                if(!timeData) {
                    return;
                }

                journeyIds.push(timeData.journeyId);
            });
        });

        callback(null, stopId, journeyIds);
    });
};

var getAllJourneyTimes = function(stopId, journeyIds, callback) {
    Async.map(journeyIds, api.getJourneyTimes.bind(this, stopId), callback);
};

// Journeys are the journey objects returned from the API. We need to go through each journey looking for our stop and
// return the number of minutes it takes to get to our stop as well as bus stuff for that journey
var getTravelTimeForJourneys = function(stopId, journeys, callback) {
    // Travel info is an array containing travel time and bus stuff
    var travelInfoArray = journeys.map(getTravelTimeForJourney.bind(this, stopId));
    callback(null, travelInfoArray);
};

var getTravelTimeForJourney = function(stopId, journey) {
    var travelInfo = {
        serviceNumber: journey.journeyTimes[0].mnemoService,
        serviceName: journey.journeyTimes[0].nameService,
        departureTime: journey.journeyTimes[0].journeyTimeDatas[0].time,
        departureMinutes: journey.journeyTimes[0].journeyTimeDatas[0].minutes,
        arrivalTime: "",
        arrivalMinutes: ""
    };

    journey.journeyTimes[0].journeyTimeDatas.some(function(journeyTimeData) {
        if(journeyTimeData.stopId !== stopId.toString()) {
            return false;
        }

        travelInfo.arrivalTime = journeyTimeData.time;

        // Get the time and date now
        var now = new Date();

        // Pull out the hours and minutes from the hh:mm time returned by the API
        var hours = parseInt(journeyTimeData.time.split(':')[0], 10);
        var minutes = parseInt(journeyTimeData.time.split(':')[1], 10);

        // Get another Date object for right now
        var arrivalTime = new Date();
        // Set its hours and minutes
        if(hours < now.getHours()) {
            arrivalTime.setDate(arrivalTime.getDate()+1);
            arrivalTime.setHours(hours);
        };

        arrivalTime.setMinutes(minutes);

        var diffMs = arrivalTime - now;
        var diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000); 

        travelInfo.arrivalMinutes = diffMins;
        return true;
    });

    return travelInfo;
};

routes.getJourneys = function(request, reply) {
    var from = request.query.from;
    var to = request.query.to;
    var limit = request.query.limit || 1;

    Async.waterfall([getDestinationRefDest.bind(this, from, to), getJourneyIds, getAllJourneyTimes, getTravelTimeForJourneys.bind(this, to)], function(err, results) {
        var sortedResults = results.sort(function(a, b) {
            return a.arrivalMinutes - b.arrivalMinutes;
        });
        reply(results);
    });
};



var getBaseURL = function() {
    var date = new Date();

    var apiKey = 'Q9CASFDTCUS6D13FHGA5HSZFI';
    var dateString = date.getFullYear().toString() + '0' + (date.getMonth() + 1).toString() + date.getDate().toString() + date.getHours().toString();

    apiKey += dateString;

    var hash = Crypto.createHash('md5').update(apiKey).digest('hex');

    var url = BASE_URL + hash + '&';

    return url;
};

var S = Joi.string;
var N = Joi.number;
var A = Joi.array;

// Create a server with a host and port
var server = Hapi.createServer(config.hostname, config.port, {cors: true});

// Add the route
server.route({
    method: 'GET',
    path: '/journeys',
    config: { 
        handler: routes.getJourneys
    }
});

server.start(function() {
    var uri = "";

    if(process.env.NODE_ENV === 'production') {
        uri = 'https://' + process.env.HOSTNAME + ':' + process.env.PORT;
    } else {
        uri = 'http://' + config.hostname + ':' + config.port;
    }
    console.log('Server started at ' + uri);
    
});