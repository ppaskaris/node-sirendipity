'use strict';

const Http = require('http');
const SirenClient = require('./index');
const Tap = require('tap');

const internals = {};

internals.homeText = function (port) {

  return JSON.stringify({
    class: ['home'],
    properties: {
      greetings: 'Hello!'
    },
    actions: [
      {
        name: 'query',
        method: 'GET',
        href: `http://localhost:${port}/query-action`
      },
      {
        name: 'query-hidden',
        method: 'GET',
        href: `http://localhost:${port}/query-action`,
        fields: [
          {
            name: 'optional',
            type: 'hidden'
          },
          {
            name: 'token',
            type: 'hidden',
            value: 'spooky'
          }
        ]
      },
      {
        name: 'form',
        method: 'POST',
        href: `http://localhost:${port}/form-action`
      },
      {
        name: 'json',
        method: 'PUT',
        href: `http://localhost:${port}/json-action`,
        type: 'application/json'
      },
      {
        name: 'invalid-type',
        method: 'PUT',
        href: `http://localhost:${port}/invalid-type-action`,
        type: 'application/x-bojack-horseman'
      },
      {
        name: 'duplicate-field',
        method: 'PATCH',
        href: `http://localhost:${port}/duplicate-field-action`,
        fields: [
          {
            name: 'token',
            type: 'hidden',
            value: 'spooky1'
          },
          {
            name: 'token',
            type: 'hidden',
            value: 'spooky2'
          }
        ]
      }
    ],
    entities: [
      {
        rel: ['embedded'],
        class: ['non-echo']
      },
      {
        rel: ['linked'],
        href: `http://localhost:${port}/entity`
      }
    ],
    links: [
      {
        rel: ['self'],
        href: `http://localhost:${port}`
      }
    ]
  });
};

internals.echoText = function (properties) {

  return JSON.stringify({
    class: ['echo'],
    properties
  });
};

internals.bodyText = function (req, callback) {

  const chunks = [];
  let didInvokeCallback = false;
  req.on('data', (chunk) => {

    chunks.push(chunk);
  });
  req.on('error', (err) => {

    if (!didInvokeCallback) {
      didInvokeCallback = true;
      callback(err);
    }
  });
  req.on('end', () => {

    if (!didInvokeCallback) {
      didInvokeCallback = true;
      const text = chunks.length > 0 ?
        Buffer.concat(chunks).toString() : '(Empty)';
      callback(null, text);
    }
  });
};

internals.withServer = function (func) {

  return new Promise((resolve, reject) => {

    const server = Http.createServer((req, res) => {

      const { method, url } = req;
      if (method === 'GET' && url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.siren+json' });
        res.end(internals.homeText(server.address().port));
      }
      else if (method === 'GET' && url === '/greeting.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"message": "Greetings!"}');
      }
      else if (method === 'GET' && url === '/teapot') {
        res.writeHead(418, { 'Content-Type': 'text/plain' });
        res.end('The requested entity body is short and stout.');
      }
      else if (method === 'GET' && url === '/nothing') {
        res.writeHead(204);
        res.end();
      }
      else {
        internals.bodyText(req, (err, text) => {

          if (err) {
            res.writeHead(500);
            res.end(String(err));
            return;
          }

          const properties = {
            method, url,
            headers: req.headers,
            body: text
          };
          res.writeHead(200, { 'Content-Type': 'application/vnd.siren+json' });
          res.end(internals.echoText(properties));
        });
      }
    });

    server.listen(0, (err) => {

      if (err) {
        return reject(err);
      }

      const port = server.address().port;

      let promise;
      try {
        promise = Promise.resolve(func(port));
      }
      catch (error) {
        promise = Promise.reject(error);
      }

      promise = promise.then(
        (result) => {

          server.close();
          return Promise.resolve(result);
        },
        (error) => {

          server.close();
          return Promise.reject(error);
        }
      );

      return resolve(promise);
    });
  });
};

Tap.test('throws for non-Siren', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync('/greeting.json').then((response) => {

      t.notOk(response, 'getAsync should have rejected');
    }, (error) => {

      t.type(error, Error);
    });
  });
});

Tap.test('throws for non-success', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync('/teapot').then((response) => {

      t.notOk(response, 'getAsync should have rejected');
    }, (error) => {

      t.type(error, Error);
    });
  });
});

Tap.test('doesnt throw for empty response', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync('/nothing').then((response) => {

      t.ok(response);
      t.equal(response.status, 204);
    });
  });
});

Tap.test('get home page', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response) => {

      const { properties } = response;
      t.equal(properties.greetings, 'Hello!');
    });
  });
});

Tap.test('submit query action', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('query');

      const data = { key: 'value' };
      return client.submitAsync(action, data).then((response2) => {

        const { properties } = response2;
        t.equal(properties.method, 'GET');
        t.equal(properties.url, '/query-action?key=value');
      });
    });
  });
});

Tap.test('submit query action with hiddens', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('query-hidden');
      const data = { key: 'value' };
      return client.submitAsync(action, data).then((response2) => {

        const { properties } = response2;
        t.equal(properties.method, 'GET');
        t.equal(properties.url, '/query-action?token=spooky&key=value');
      });
    });
  });
});

Tap.test('submit form action', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('form');
      const data = { key: 'value avec espace' };
      return client.submitAsync(action, data).then((response2) => {

        const { properties } = response2;
        t.equal(properties.method, 'POST');
        t.equal(properties.url, '/form-action');
        t.ok(properties.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
        t.equal(response2.properties.body, 'key=value%20avec%20espace');
      });
    });
  });
});

Tap.test('submit json action', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('json');
      const data = { key: '"quotes"' };
      return client.submitAsync(action, data).then((response2) => {

        const { properties } = response2;
        t.equal(properties.method, 'PUT');
        t.equal(properties.url, '/json-action');
        t.ok(properties.headers['content-type'], 'application/json;charset=UTF-8');
        t.equal(properties.body, '{"key":"\\"quotes\\""}');
      });
    });
  });
});

Tap.test('submit invalid action', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('invalid-type');
      const data = { key: 'value' };

      t.throws(() => {

        client.submitAsync(action, data);
      });
    });
  });
});

Tap.test('submit duplicate field action', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('duplicate-field');
      const data = { key: 'value' };
      return client.submitAsync(action, data).then((response2) => {

        const { properties } = response2;
        t.equal(properties.method, 'PATCH');
        t.equal(properties.url, '/duplicate-field-action');
        t.ok(properties.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
        t.equal(response2.properties.body, 'token=spooky1&key=value');
      });
    });
  });
});

Tap.test('submit duplicate field action', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const action = response1.getActionByName('duplicate-field');
      const data = { key: 'value' };
      return client.submitAsync(action, data).then((response2) => {

        const { properties } = response2;
        t.equal(properties.method, 'PATCH');
        t.equal(properties.url, '/duplicate-field-action');
        t.ok(properties.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
        t.equal(response2.properties.body, 'token=spooky1&key=value');
      });
    });
  });
});

Tap.test('fetch single linked sub-entity', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const subEntity = response1.getSubEntity('linked');
      return client.fetchAsync(subEntity).then((response2) => {

        const { rel, properties } = response2;
        t.same(rel, ['linked']);
        t.equal(properties.method, 'GET');
        t.equal(properties.url, '/entity');
      });
    });
  });
});

Tap.test('fetch mixed embedded and linked sub-entities', (t) => {

  return internals.withServer((port) => {

    const client = new SirenClient({
      baseUrl: `http://localhost:${port}`
    });

    return client.getAsync().then((response1) => {

      const subEntities = response1.entities;
      return client.fetchAsync(subEntities).then((responses) => {

        t.type(responses, Array);
        t.type(responses.length, subEntities.length);

        const [embedded, linked] = responses;
        t.same(embedded.rel, ['embedded']);
        t.same(embedded.class, ['non-echo']);
        t.equal(embedded.properties, undefined);
        t.same(linked.rel, ['linked']);
        t.same(linked.class, ['echo']);
        t.equal(linked.properties.method, 'GET');
        t.equal(linked.properties.url, '/entity');
      });
    });
  });
});
