'use strict';

const NodeFetch = require('node-fetch');
const Os = require('os');
const Package = require('./package.json');
const QueryString = require('querystring');
const SirenEntity = require('siren-parser');
const Url = require('url');

const internals = {
  fetch: null,
  headers: {
    'User-Agent': `Sirendipity/${Package.version} (${Os.type()} ${Os.arch()})`,
    'Accept': 'application/vnd.siren+json,application/json;q=0.5'
  }
};

internals.forward = function (ctor, name, target) {

  Object.defineProperty(ctor.prototype, name, {
    get() {

      return this[target][name];
    }
  });
};

internals.proxy = function (ctor, name, target) {

  ctor.prototype[name] = function proxied() {

    const other = this[target];
    return other[name].apply(other, arguments);
  };
};

internals.SirenResponse = function (response, entity) {

  this._response = response;
  this._entity = entity;
};

// TODO: A better way of mixing these together.

internals.forward(internals.SirenResponse, 'url', '_response');
internals.forward(internals.SirenResponse, 'redirected', '_response');
internals.forward(internals.SirenResponse, 'status', '_response');
internals.forward(internals.SirenResponse, 'ok', '_response');
internals.forward(internals.SirenResponse, 'statusText', '_response');
internals.forward(internals.SirenResponse, 'headers', '_response');

internals.forward(internals.SirenResponse, 'rel', '_entity');
internals.forward(internals.SirenResponse, 'title', '_entity');
internals.forward(internals.SirenResponse, 'type', '_entity');
internals.forward(internals.SirenResponse, 'properties', '_entity');
internals.forward(internals.SirenResponse, 'class', '_entity');
internals.forward(internals.SirenResponse, 'actions', '_entity');
internals.forward(internals.SirenResponse, 'links', '_entity');
internals.forward(internals.SirenResponse, 'entities', '_entity');

internals.proxy(internals.SirenResponse, 'hasActionByName', '_entity');
internals.proxy(internals.SirenResponse, 'hasAction', '_entity');
internals.proxy(internals.SirenResponse, 'hasActionByClass', '_entity');
internals.proxy(internals.SirenResponse, 'hasClass', '_entity');
internals.proxy(internals.SirenResponse, 'hasEntityByRel', '_entity');
internals.proxy(internals.SirenResponse, 'hasEntityByClass', '_entity');
internals.proxy(internals.SirenResponse, 'hasEntityByType', '_entity');
internals.proxy(internals.SirenResponse, 'hasLinkByRel', '_entity');
internals.proxy(internals.SirenResponse, 'hasLinkByClass', '_entity');
internals.proxy(internals.SirenResponse, 'hasLinkByType', '_entity');
internals.proxy(internals.SirenResponse, 'hasProperty', '_entity');

internals.proxy(internals.SirenResponse, 'getActionByName', '_entity');
internals.proxy(internals.SirenResponse, 'getAction', '_entity');
internals.proxy(internals.SirenResponse, 'getActionByClass', '_entity');
internals.proxy(internals.SirenResponse, 'getLinkByRel', '_entity');
internals.proxy(internals.SirenResponse, 'getLink', '_entity');
internals.proxy(internals.SirenResponse, 'getLinkByClass', '_entity');
internals.proxy(internals.SirenResponse, 'getLinkByType', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntityByRel', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntity', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntityByClass', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntityByType', '_entity');
internals.proxy(internals.SirenResponse, 'getActionsByClass', '_entity');
internals.proxy(internals.SirenResponse, 'getLinksByRel', '_entity');
internals.proxy(internals.SirenResponse, 'getLinks', '_entity');
internals.proxy(internals.SirenResponse, 'getLinksByClass', '_entity');
internals.proxy(internals.SirenResponse, 'getLinksByType', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntitiesByRel', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntities', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntitiesByClass', '_entity');
internals.proxy(internals.SirenResponse, 'getSubEntitiesByType', '_entity');

internals.SirenClient = function (options) {

  this._baseUrl = options.baseUrl || null;
  this._fetch = options.fetch || NodeFetch;
  this._headers = Object.assign({}, internals.headers, options.headers);
};

internals.filterSuccess = function (response) {

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response;
};

internals.filterSiren = function (response) {

  if (response.status === 204) {
    return new internals.SirenResponse(response, new SirenEntity());
  }

  const contentType = response.headers.get('content-type');
  if (contentType !== 'application/vnd.siren+json') {
    throw new Error('Server did not response with a Siren representation.');
  }

  return response.json().then((json) => {

    const entity = new SirenEntity(json);
    return new internals.SirenResponse(response, entity);
  });
};

internals.SirenClient.prototype._requestAsync = function (href, options) {

  const url = this._baseUrl !== null ? Url.resolve(this._baseUrl, href) : href;

  return this._fetch(url, options)
    .then(internals.filterSuccess)
    .then(internals.filterSiren);
};

internals.SirenClient.prototype.getAsync = function (href) {

  if (href === undefined) {
    href = '/';
  }

  const options = {
    method: 'GET',
    headers: this._headers
  };

  return this._requestAsync(href, options);
};

internals.fieldsToObject = function (fields) {

  return fields.reduce((data, field) => {

    if (field.value === undefined) {
      return data;
    }

    if (data[field.name] !== undefined) {
      return data;
    }

    data[field.name] = field.value;
    return data;
  }, {});
};

internals.SirenClient.prototype.submitAsync = function (action, data) {

  const options = {
    method: action.method,
    headers: this._headers,
    body: undefined
  };

  if (action.fields) {

    const dataFromFields = internals.fieldsToObject(action.fields);
    data = Object.assign(dataFromFields, data);
  }

  let href = action.href;
  if (action.method === 'GET') {
    href += href.includes('?') ? '&' : '?';
    href += QueryString.stringify(data);
  }
  else {
    if (action.type === 'application/json') {
      options.body = JSON.stringify(data);
      options.headers = Object.assign({}, options.headers);
      options.headers['Content-Type'] = 'application/json;charset=UTF-8';
    }
    else if (action.type === 'application/x-www-form-urlencoded') {
      options.body = QueryString.stringify(data);
      options.headers = Object.assign({}, options.headers);
      options.headers['Content-Type'] =
        'application/x-www-form-urlencoded;charset=UTF-8';
    }
    else {
      throw new Error(`Cannot create request body as "${action.type}".`);
    }
  }

  return this._requestAsync(href, options);
};

internals.SirenClient.prototype.fetchAsync = function (subEntities) {

  let returnOne = false;
  if (!Array.isArray(subEntities)) {
    subEntities = [subEntities];
    returnOne = true;
  }

  const promises = subEntities.map((subEntity) => {

    if (subEntity.href === undefined) {
      return Promise.resolve(subEntity);
    }

    return this.getAsync(subEntity.href).then((entity) => {

      if (entity._entity !== undefined) {
        entity._entity.rel = subEntity.rel;
      }
      return entity;
    });
  });

  if (returnOne) {
    return promises[0];
  }

  return Promise.all(promises);
};

module.exports = internals.SirenClient;
