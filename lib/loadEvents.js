#! /usr/bin/env node

const co = require('co');
const faker = require('faker');
const uuid = require('node-uuid');
const bunyan = require('bunyan');
const bformat = require('bunyan-format');
const program = require('commander');
const R = require('ramda');
const is = require('is_js');
const path = require('path');
const dbUtils = require('@elm-slate/db-utils');
const dbEvents = require('@elm-slate/db-events');
const utils = require('./utils');
const testEvents = require('./testEvents');

const startDate = new Date();

const formatOut = bformat({ outputMode: 'long' });

const logger = bunyan.createLogger({
	name: 'loadEvents',
	stream: formatOut,
	serializers: bunyan.stdSerializers
});

const exit = exitCode => setTimeout(_ => process.exit(exitCode), 1000);

process.on('uncaughtException', err => {
	logger.error({err: err}, `Uncaught exception:`);
	exit(1);
});
process.on('unhandledRejection', (reason, p) => {
	logger.error("Unhandled Rejection at: Promise ", p, " reason: ", reason);
	exit(1);
});
const handleSignal = signal => process.on(signal, _ => {
	logger.info(`${signal} received.`);
	exit(0);
});
R.forEach(handleSignal, ['SIGINT', 'SIGTERM']);

program
	.option('-c, --config-filename <s>', 'configuration file name')
	.option('--filler-events-between <n>', 'number of Filler events between each Target event.  Default 10000.', '10000')
	.option('--max-events-per-insert <n>', 'maximum number of events per SQL insert.  Default 25.', '25')
	.option('--dry-run', 'if specified, show run parameters and end without writing any events')
	.parse(process.argv);

const validateArguments = arguments => {
	var errors = [];
	if (!arguments.configFilename || is.not.string(arguments.configFilename))
		errors = R.append('config-filename is invalid:  ' + JSON.stringify(arguments.configFilename), errors);
	if (!utils.isStringPositiveInteger(arguments.fillerEventsBetween))
		errors = R.append('filler-events-between is not a positive integer:  ' + JSON.stringify(arguments.fillerEventsBetween), errors);
	if (!utils.isStringPositiveInteger(arguments.maxEventsPerInsert))
		errors = R.append('max-events-per-insert is not a positive integer:  ' + JSON.stringify(arguments.maxEventsPerInsert), errors);
	if (!(arguments.dryRun === undefined || arguments.dryRun === true))
		errors = R.append('dry-run is invalid:  ' + JSON.stringify(arguments.dryRun), errors);
	if (arguments.args.length > 0)
		errors = R.append(`Some command arguments exist after processing command options.  There may be command options after " -- " in the command line.  Unprocessed Command Arguments:  ${program.args}`, errors);
	return errors;
};

const logConfig = config => {
	logger.info(`Event Source Connection Params:`, R.pick(['host', 'databaseName', 'user'], config.eventSource));
	if (config.connectTimeout)
		logger.info(`Database Connection Timeout (millisecs):`, config.connectTimeout);
};
/////////////////////////////////////////////////////////////////////////////////////
//  validate configuration
/////////////////////////////////////////////////////////////////////////////////////
logger.info('\n### ' + startDate.toISOString() + ' ###\n');

const errors = validateArguments(program);
if (errors.length > 0) {
	logger.error('Invalid command line arguments:\n' + R.join('\n', errors));
	program.help();
	process.exit(1);
}
// get absolute name so logs will display absolute path
const configFilename = path.isAbsolute(program.configFilename) ? program.configFilename : path.resolve('.', program.configFilename);

let config;
try {
	logger.info(`${'\n'}Config File Name:  "${configFilename}"${'\n'}`);
	config = require(configFilename);
}
catch (err) {
	logger.error({err: err}, `Exception detected processing configuration file:`);
	process.exit(1);
}

var configErrors = utils.validateConnectionParameters(config.eventSource, 'config.eventsSource');
if (config.connectTimeout) {
	if (!utils.isPositiveInteger(config.connectTimeout)) {
		configErrors = R.append(`config.connectTimeout is invalid:  ${config.connectTimeout}`, configErrors);
	}
}
if (configErrors.length > 0) {
	logger.error(`Invalid configuration parameters:${'\n' + R.join('\n', configErrors)}`);
	program.help();
	process.exit(2);
}

// db connection url
const connectionUrl = dbUtils.createConnectionUrl(config.eventSource);
// number of filler events to create between each user event
const fillerEventsBetween = Number(program.fillerEventsBetween);
// max events per SQL insert statement
const maxEventsPerInsert = Number(program.maxEventsPerInsert);

const fillerEventsBetweenDivisor = fillerEventsBetween + 1;


logConfig(config);

logger.info('\nNumber of TargetEvents:  ' + testEvents.targetEvents.length +
	'\nNumber of Filler Events between each Target Event:  ' + fillerEventsBetween +
	'\nMaximum Number of Events per SQL Insert:  ' + maxEventsPerInsert +
	'\nNumber of Events that will be created:  '
		+ utils.formatNumber((testEvents.targetEvents.length - 1) * fillerEventsBetween + (testEvents.targetEvents.length)) + '\n');

//logger.info('\nConnection Url:  ' + connectionUrl + '\n');

if (program.dryRun) {
	logger.info('dry-run specified, ending program');
	process.exit(0);
}


const createEntityIds = count => R.map(() => uuid.v4(), new Array(count));

const initiatorIdList = createEntityIds(30);
const fillerEntityIdList = createEntityIds(1000);

// return random integer between min (inclusive) and max (exclusive)
const getRandomInt = (min, max) => {
	return Math.floor(Math.random() * (max - min)) + min;
};

const getRandomId = (list) => {
	return list[getRandomInt(0, list.length)];
};

const progressMessage = (eventsCreated) => {
	if (eventsCreated % 500000 === 0) {
		logger.info(`${utils.formatNumber(eventsCreated)} Events created`);
	}
};

const getNextTargetEvent = (eventsCreated) => {
	if (eventsCreated < testEvents.targetEvents.length) {
		return {event: testEvents.targetEvents[eventsCreated], done: eventsCreated + 1  === testEvents.targetEvents.length};
	}
	else {
		throw new Error('Index out of range: ' + eventsCreated);
	}
};

const getNextFillerEvent = () => {
	const fillerEvent = testEvents.fillerEvents[getRandomInt(0, testEvents.fillerEvents.length - 1)];
	fillerEvent.entityId = getRandomId(fillerEntityIdList);;
	fillerEvent.metadata.initiatorId = getRandomId(initiatorIdList);
	return fillerEvent;
};

const logCounts = (countEventsCreated) => {
	logger.info('Total Events Created:  ' + countEventsCreated + '\n');
};

// create a set of events
const createEvents = (countToCreate, targetEventsCreated, totalEventsCreated) => {
	var events = [];
	var done = false;
	while (events.length < countToCreate && !done) {
		if ((targetEventsCreated === 0) || ((events.length + totalEventsCreated) % fillerEventsBetweenDivisor === 0)) {
			var eventResult = getNextTargetEvent(targetEventsCreated);
			events[events.length] = eventResult.event;
			done = eventResult.done;
			targetEventsCreated++;
			logger.info(`Target Event created at event number ${utils.formatNumber(events.length + totalEventsCreated)}`);
		}
		progressMessage(events.length + totalEventsCreated);
		if (!done) {
			events[events.length] = getNextFillerEvent();
		}
	}
	return {events: events, done: done, targetEventsCreated: targetEventsCreated};
};


const createAndInsertEvents = co.wrap(function *(dbClient) {
	var totalEventsCreated = 0;
	var totalInsertStatementsCreated = 0;
	var targetEventsCreated = 0;
	var errorMessage = '';
	var done = false;
	while (!done) {
		var eventsResult = createEvents(maxEventsPerInsert, targetEventsCreated, totalEventsCreated);
		var insertStatement = dbEvents.createInsertEventsSQLStatement(eventsResult.events);
		done = eventsResult.done;
		targetEventsCreated = eventsResult.targetEventsCreated;
		var countEventsCreated = eventsResult.events.length;
		var result = yield dbUtils.executeSQLStatement(dbClient, insertStatement);
		if (result.rowCount === 1) {
			var row1 = result.rows[0];
			if (!(row1['insert_events'] && row1['insert_events'] === countEventsCreated)) {
				errorMessage = `Program logic error.  Event count doesn't match rows inserted.  Event Count:  ${countEventsCreated}  Rows Inserted:  ${row1['insert_events']}`;
				logger.error(`${errorMessage}  SQL Statement:  ${insertStatement.substr(0, 4000)}...`);
				throw new Error(errorMessage);
			}
		}
		else {
			errorMessage = `Program logic error.  Expected result array of one object to be returned.  Result:  ${JSON.stringify(result)}`;
			logger.error(`${errorMessage}  SQL Statement:  ${insertStatement.substr(0, 4000)}...`);
			throw new Error(errorMessage);
		}
		totalEventsCreated += countEventsCreated;
		totalInsertStatementsCreated++;
	}
	logCounts(totalEventsCreated);
});

const logDbStatus = co.wrap(function *(dbClient) {
	const rowCount = yield dbEvents.getEventCount(dbClient);
	// get maximum event source event id
	const maxEventId = yield dbEvents.getMaximumEventId(dbClient);
	logger.info(`Event Source Client status - Database: ${dbClient.database}` +
		`    Host:  ${dbClient.host}    user:  ${dbClient.user}` + `    SSL Connection:  ${dbClient.ssl}` +
		`    Row Count:  ${utils.formatNumber(rowCount)}    Maximum Event Id:  ${maxEventId}`);
});

const main = co.wrap(function *(connectionUrl, connectTimeout) {
	let pooledDbClient;
	let getListener;
	try {
		dbUtils.setDefaultOptions({logger: logger, connectTimeout: connectTimeout});
		pooledDbClient = yield dbUtils.createPooledClient(connectionUrl);
		const dbClientDatabase = pooledDbClient.dbClient.database;
		getListener = err => {
			logger.error({err: err}, `Error for database ${dbClientDatabase}`);
			throw err;
		};
		pooledDbClient.dbClient.on('error', getListener);
		yield logDbStatus(pooledDbClient.dbClient);
		yield createAndInsertEvents(pooledDbClient.dbClient);
		yield logDbStatus(pooledDbClient.dbClient);
	}
	finally {
		// must remove events listener due to the way the connection pool works
		if (pooledDbClient && getListener) {
			pooledDbClient.dbClient.removeListener('error', getListener);
		}
		if (pooledDbClient) {
			dbUtils.close(pooledDbClient);
		}
	}
});

main(connectionUrl, config.connectTimeout)
	.then(() => {
		const elapsed = Date.now() - startDate.getTime();
		logger.info('Processing complete\n### ELAPSED TIME:  ' + (elapsed / 1000) + ' SECs ###\n');
		exit(0);
	})
	.catch(err => {
		logger.error({err: err}, `Exception in loadEvents:`);
		exit(1);
	});
