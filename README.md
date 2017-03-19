# node-sirendipity

Client for consuming APIs that produce [Siren
hypermedia](https://github.com/kevinswiber/siren) representations.

```js
const SirenClient = require('sirendipity');

const client = new SirenClient({
  baseUrl: 'https://api.example.org/v1/',
  headers: {
    Authorization: 'Basic QWxhZGRpbjpPcGVuU2VzYW1l'
  }
});

function sumOrderedWidgets(keyword) {

  // Get the HAPI home page.
  return client.getAsync('/').then((home) => {

    // Look for the search action.
    const action = home.getActionByName('find-widgets');
    if (!action) {
      throw new Error('Server did not expose the search action.');
    }

    const data = { query: keyword };

    // Submit the search action.
    return client.submitAsync(action, data).then((submission) => {

      // Look for the result items.
      const subEntities = submission.getSubEntitiesByRel('item');
      if (subEntities.length <= 0) {
        return 0;
      }

      // Fetch their representations.
      return client.fetchAsync(subEntities).then((widgets) => {

        // Compute the sum.
        const count = widgets.reduce((sum, widgets) => {

          return sum + widgets.properties.numOrdered;
        }, 0);

        return count;
      });
    });
  });
}

sumOrderedWidgets('foo').then(
  (count) => console.log(`${count} widgets ordered!`),
  (err) => console.log(`No widgets ordered because [${err}].`)
);
```
