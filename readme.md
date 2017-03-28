# test-db

> Test programs for creating `slate` events and validating replication of the events table in a Slate Event Source Database.

The purpose of `test-db` is to provide programs that will load events into an events table in an events source database.

In addition, there is also a program that will compare the events tables in two databases in order to validate that  [`slate-replicator`](https://github.com/elm-slate/slate-replicator) is functioning properly.

`test-db` programs require node version 6 or greater.

# Installation
> npm install -g @elm-slate/test-db

## Test Tools

There are four test tools, `loadPersonData.js`, `loadPerfTestData.js`, `loadEvents.js`, and `eventsDiff.js`.

### Load Events Programs

The three test tools beginning with `load` are for loading events into an events source database events table.

These programs require that the target database was created using [`init-slate-db`](https://github.com/elm-slate/init-slate-db) with `source` as the `--table-type option`.

### Compare Events Program

The `eventsDiff.js` program is used to compare rows in two events tables for differences.

The program's target databases can be created using [`init-slate-db`](https://github.com/elm-slate/init-slate-db) with either `source` or `destination` as the `--table-type option`.


### slate-replicator Testing

`loadPersonData.js` and `eventsDiff.js` can be used to facilitate testing the [`slate-replicator`](https://github.com/elm-slate/replicator).

#### loadPersonData.js

This program can be used to test `slate-replicator` by loading the `events` table in the `eventSource` database with realistic looking event data supplied by using the [`faker`](https://www.npmjs.com/package/faker) library.

It is started by running `slate-loadPersonData [options]`.

It also creates validation data in each event that can be optionally checked by the `eventsDiff.js` program to provide a more thorough validation of `slate-replicator` processing.

#### eventsDiff.js

First the program validates the data in each `events` table being compared.

Second the program compares rows in the `events` table in the configuration file `eventSource` database with corresponding rows with matching id column values in the `events` table in the configuration file `replicationDestination` database.

It is started by running `slate-eventsDiff [options]`.

The program can be run such that all `events` table row differences can be reported or the program can stop after detecting a configurable number of `events` table row differences.

The `loadPersonData` and `eventsDiff` programs can be used to test `slate-replicator` in the following manner:
- Run the `loadPersonData` program to completion to create data in the `events` table in the `eventSource` database.  Multiple `loadPersonData` programs can be run at the same time for a more robust test.
- Run the `slate-replicator` to replicate the test data to an `events` table in a `replicationDestination` database, and stop the `slate-replicator` using `Cntrl-C` when replication is complete.  The `slate-replicator` program can be started before, during, or after the `loadPersonData` program(s) are running.
- Configure and run the `eventsDiff` program to validate and compare data in the two `events` tables processed by the replicator program.  If the replicator ran properly, then there should be no validation errors or event differences reported by the `eventsDiff` program.

### Performance testing

#### loadPerfTestData.js and loadEvents.js

There two additional test tools, `loadPerfTestData.js` and `loadEvents.js` that were written to create data in the `events` table in order to test database and index performance.

They are started by running `slate-loadPerfTestData [options]` or `slate-loadEvents [options]` respectively.

Further information regarding how to use the test tools can be found by running the test tool using `--help` for `[options]` or by reading the comments in the test programs.

# Usage

## Load Events Programs

#### Run loadPersonData.js

    slate-loadPersonData [options]

options:

    -h, --help                 output usage information
    -c, --config-filename <s>  configuration file name
    --count-person <n>         number of different person event series to create.  Default 1000.
    --count-filler <n>         number of filler events to create.  Default 10000.
    --count-person-delete <n>  maximum number of person delete events to create.  Default 50.
    --dry-run                  if specified, show run parameters and end without writing any events

#### Run loadPerfTestData.js

    slate-loadPerfTestData [options]

options:

    -h, --help                   output usage information
    -c, --config-filename <s>    configuration file name
    --filler-events-between <n>  number of Filler events between each User event.  Default 10000.
    --max-events-per-insert <n>  maximum number of events per SQL insert.  Default 25.
    --dry-run                    if specified, show run parameters and end without writing any events

#### Run loadEvents.js

    slate-loadEvents [options]

options:

    -h, --help                   output usage information
    -c, --config-filename <s>    configuration file name
    --filler-events-between <n>  number of Filler events between each Target event.  Default 10000.
    --max-events-per-insert <n>  maximum number of events per SQL insert.  Default 25.
    --dry-run                    if specified, show run parameters and end without writing any events

### Sample Configuration file for loadPerfTestData.js, loadPerfTestData.js, and loadEvent.js

```javascript
var config = {
	// optional parameter.  database connection timeout in milliseconds.  default value:  15000.
	connectTimeout: 15000,
	// connection parameters to event source database.  events generated in the test program will be inserted into the events table in this database.
	eventSource: {
		host: 'localhost',
		databaseName: 'testing',
		user: 'user',
		password: 'password'
	}
};

module.exports = config;
```

#### connectTimeout
> An optional parameter that specifies the maximum number of milliseconds to wait to connect to a database before throwing an Error.  Default value is `15000` milliseconds.


#### eventSource
  > Parameters used to connect to the Event Source database

| Field         | Required | Description                
| ------------- |:--------:| :---------------------------------------
| host          | Yes      | database server name
| databaseName  | Yes      | database name containing the events table         
| user          | No       | database user name.  connection attempt will fail if missing and required by database.
| password      | No       | database user password.  connection attempt will fail if missing and required by database.

### Compare Events Program

#### Run eventsDiff.js

    slate-eventsDiff [options]

options:

    -h, --help                 output usage information
    -c, --config-filename <s>  configuration file name
    -v, --validate-tables      optional parameter.  if specified, validate "testingStats" in each events table.  must have created each event column jsonb object with "testingStats property".  see lib/loadPersonData.js.
    --dry-run                  if specified, display run parameters and end program without starting eventsDiff

### Sample Configuration file for eventsDiff.js

```javascript
var config = {
	// maximum events read from events table per database operation.  optional parameter.  minumum value 50000.
	maxEventsPerRead: 50000,
	// end program when this number of event differences is detected.  optional parameter.  will check all events if
	// not specified no matter how many events don't match.
	maxDiffs: 100,
	// optional parameter.  database connection timeout in milliseconds.  default value:  15000.
	connectTimeout: 15000,
	// connection parameters to database for one of the events table in the comparison
	events1Params: {
		host: 'localhost',
		databaseName: 'sourceDb',
		user: 'user1',
		password: 'password1'
	},
	// connection parameters to database for second events table in the comparison
	events2Params: {
		host: 'localhost',
		databaseName: 'replicationDb',
		user: 'user1',
		password: 'password1'
	}
};

module.exports = config;
```
#### maxEventsPerRead

> An optional parameter that specifies the maximum number of events read per database operation from either events table.  Default value is `50000` events.

#### maxDiffs

> Directs the compare program to end when this number of event differences are detected between the two events tables.  Default value is `100` events.  If this parameter is not specified, then the compare program will check and report all event differences between the two tables.

#### connectTimeout
> An optional parameter that specifies the maximum number of milliseconds to wait to connect to a database before throwing an Error.  Default value is `15000` milliseconds.

#### event1Params and event2Params
  > Parameters used to connect to the two Event Source databases being compared

| Field         | Required | Description                
| ------------- |:--------:| :---------------------------------------
| host          | Yes      | database server name
| databaseName  | Yes      | database name containing the events table         
| user          | No       | database user name.  connection attempt will fail if missing and required by database.
| password      | No       | database user password.  connection attempt will fail if missing and required by database.


## Shutdown
All test programs can be shutdown before completion using the `Cntrl-C` keystroke.

## Logging
All test programs use the `bunyan` logging library to log all exceptions and informational messages. Logging is done to the console.
