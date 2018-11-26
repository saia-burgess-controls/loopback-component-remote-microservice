const urlLib = require('url');
const { RemoteMicroserviceError } = require('./errors.js');

/**
 * Helper class to normalize the configuration of the component to avoid complex configuration
 * handling within the different classes.
 *
 * @type {module.ComponentConfig}
 */
module.exports = class ComponentConfig {

    constructor(app, config) {
        this.app = app;
        this.config = config;
    }

    /**
     * Validates the given configuration and throws an error if it is not valid.
     *
     * @throws RemoteMicroserviceError
     */
    validate() {
        this.normalize();
    }

    validateDiscovery(discovery = {}) {}

    validateServices(services = {}) {
        Object.entries(services).forEach(([serviceName, config]) => {
            this.validateService(serviceName, config);
        });
    }

    _ensureDatasource(serviceName, dataSource) {
        const ds = this.app.dataSources[dataSource];
        if (!ds) {
            const msg = `Service "${serviceName}" does not seem to be assigned to a valid dataSource ("${dataSource}")"}`;
            throw new RemoteMicroserviceError(msg);
        }
        const { name } = ds.connector;
        if (name !== 'remote-connector') {
            const msg = `Service "${serviceName}" is assigned to a data source which is not based on the "remote-connector" ("${name}")"}`;
            throw new RemoteMicroserviceError(msg);
        }
        return ds;
    }

    validateService(serviceName, config) {
        this._ensureDatasource(serviceName, config.dataSource);
    }

    normalizeServices(services = {}) {
        this.validateServices(services);

        return Object.entries(services).reduce((newConfig, [serviceName, config]) => {
            const normalizedConfig = this.normalizeService(serviceName, config);
            newConfig[serviceName] = normalizedConfig;
            return newConfig;
        }, {});
    }

    normalizeServiceName(serviceKey, config) {
        return config.name || serviceKey;
    }

    normalizeRestApiRoot(config) {
        return config.hasOwnProperty('restApiRoot')
            ? config.restApiRoot
            : '/api';
    }

    normalizeService(serviceName, config) {

        this.validateService(serviceName, config);

        const { dataSource } = config;
        const name = this.normalizeServiceName(serviceName, config);
        const ds = this._ensureDatasource(name, dataSource);
        const restApiRoot = this.normalizeRestApiRoot(config);
        const url = this.stripRestApiRoot(ds.connector.url, restApiRoot);
        const discovery = this.normalizeDiscovery(config.discovery);
        return {
            dataSource,
            discovery,
            name,
            url,
            restApiRoot,
        };
    }

    stripRestApiRoot(url) {
        const template = urlLib.parse(url);
        const templateWithoutPath = Object.assign(template, { pathname: '/' });
        return urlLib.format(templateWithoutPath);
    }

    normalizeDiscovery(discovery) {
        this.validateDiscovery(discovery);
        if (!discovery) {
            return {
                disabled: true,
            };
        }
        return Object.assign({
            disabled: discovery.disabled === true,
            pathname: '/discovery',
            method: 'get',
            models: null,
            autoDiscover: true,
            timeout: 10000,
            delay: 1000,
            delayFactor: 2,
            maxDelay: 40000,
        }, discovery);
    }

    normalize() {
        const services = this.normalizeServices(this.config.services);
        const discovery = this.normalizeDiscovery(this.config.discovery);
        const exposeAt = this.config.exposeAt || 'remote-microservice';
        return {
            services,
            discovery,
            exposeAt,
        };
    }

    static normalizeConfiguration(app, config) {
        const conf = new ComponentConfig(app, config);
        return conf.normalize();
    }
};
