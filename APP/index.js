'use strict';
const schema = require('./schema');
const createGraphqlRouter = require('./foxx-graphql'); // From arangodb 3.1 (remove when upgrade)
// const createGraphqlRouter = require('@arangodb/foxx/graphql');

// Load repositories
require('./repositories');

// TODO: Replace with graphql router
module.context.use('/accessablesuppliers', require('./routes/AccessibleSuppliers'), 'AccessibleSuppliers');
module.context.use('/accessibletours', require('./routes/AccessibleTours'), 'AccessibleTours');
module.context.use('/accessibletransfers', require('./routes/AccessibleTransfers'), 'AccessibleTransfers');
module.context.use('/accommodationplacement', require('./routes/AccommodationPlacement'), 'AccommodationPlacement');
module.context.use('/alltoursfromcity', require('./routes/alltoursfromcity'), 'alltoursfromcity');
module.context.use('/citybooking', require('./routes/CityBooking'), 'CityBooking');
module.context.use('/cityday', require('./routes/CityDay'), 'CityDay');
module.context.use('/countrybooking', require('./routes/CountryBooking'), 'CountryBooking');
module.context.use('/paxs', require('./routes/Pax'), 'PAX');
module.context.use('/proposals', require('./routes/Proposal'), 'Proposal');
module.context.use('/servicebooking', require('./routes/ServiceBooking'), 'ServiceBooking');
module.context.use('/touravailability', require('./routes/TourAvailability'), 'TourAvailability');
module.context.use('/tours', require('./routes/tours'), 'tours');
module.context.use('/transferavailability', require('./routes/TransferAvailability'), 'TransferAvailability');
module.context.use('/trips', require('./routes/Trip'), 'Trip');
module.context.use('/room-configs', require('./routes/RoomConfigs'), 'RoomConfigs');
module.context.use('/import-agents-tours', require('./routes/ImportAllAgentsTours'), 'ImportAgentsTours');
module.context.use('/word', require('./routes/ToWord'), 'ToWord');
module.context.use('/convert', require('./routes/Convert'), 'Convert');

// Create GraphQL router
const gqlRouter = createGraphqlRouter({schema, graphiql: true})
    .summary('GraphQL endpoint')
    .description('GraphQL endpoint for QP GraphQL.');

module.context.use('/graphql', gqlRouter);
