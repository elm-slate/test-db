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