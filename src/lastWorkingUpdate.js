const {existsSync, mkdirSync, readFileSync, writeFileSync, writeFile} = require('fs');
const {createServer} = require('http');

const DB_GOODS = process.env.DB_GOODS || './db_goods.json';
const PORT = process.env.PORT || 3000;
const URI_GOODS = '/user';
const URI_USER_LOGIN = '/login'

class ApiError extends Error {
  constructor(statusCode, data) {
    super();
    this.statusCode = statusCode;
    this.data = data;
  }
}

function drainJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(JSON.parse(data));
    });
  });
}

function getUserId(queryParams) {
    const data = queryParams.substring(7);
    const [login, password] = data.toLowerCase().split('-');
    const users = JSON.parse(readFileSync(DB_GOODS) || "[]");
    let isUserExist = false;

    users.map(user => {
      if (user.login === login && user.password === password) isUserExist = user.id;
    });
  
  return isUserExist;
}

function makeGoodsFromData(data, id) {
  const errors = [];

  function asString(str) {
    return str && String(str).trim() || '';
  }

  const goods = {
    name: asString(data.name).toLowerCase(),
    lastName: asString(data.lastName).toLowerCase(),
    login: asString(data.login).toLowerCase(),
    password: asString(data.password).toLowerCase(),
    email: asString(data.email).toLowerCase(),
    creationDate: asString(data.creationDate),
    transactions: data.transactions,
    rub: data.rub,
    bit: data.bit,
  };

  if (errors.length) throw new ApiError(422, {errors});

  return goods;
}

function getGoodsList(params = {}) {
  const goods = JSON.parse(readFileSync(DB_GOODS) || '[]');
  if (params.search) {
    const search = params.search.trim().toLowerCase();
    return goods.filter(goods => [
        goods.name,
        goods.login,
      ].some(str => str.toLowerCase().includes(search))
    );
  }
  return goods;
}

function createGoods(data) {
  const id = Math.random().toString().substring(2, 8) + Date.now().toString().substring(9)
  const newItem = makeGoodsFromData(data, id);
  newItem.id = id;
  const goods = JSON.parse(readFileSync(DB_GOODS) || '[]');
  goods.push(newItem);
  writeFile(DB_GOODS, JSON.stringify(goods), (err) => {
    if (err) {
      console.log(err);
      throw new ApiError(500, {message: 'Internal Server Error'});
    }
  });
  return newItem;
}

function getGoods(itemId) {
  let isUserExist = false;
  const goods = getGoodsList().find(({id}) => id === itemId);
  if (goods) isUserExist = goods;
  return isUserExist;
}

function updateGoods(itemId, data) {
  const goods = getGoodsList();
  const itemIndex = goods.findIndex(({id}) => id === itemId);
  if (itemIndex === -1) throw new ApiError(404, {message: 'Goods Not Found'});
  Object.assign(goods[itemIndex], makeGoodsFromData({...goods[itemIndex], ...data}, itemId));
  writeFileSync(DB_GOODS, JSON.stringify(goods), {encoding: 'utf8'});
  return goods[itemIndex];
}

if (!existsSync(DB_GOODS)) writeFileSync(DB_GOODS, '[]', {encoding: 'utf8'});

module.exports = createServer(async (req, res) => {

  res.setHeader('Content-Type', 'application/json');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  if (!req.url || (!req.url.startsWith(URI_GOODS) && !req.url.startsWith(URI_USER_LOGIN))) {
    res.statusCode = 404;
    res.end(JSON.stringify({message: 'Not Found'}));
    return;
  }

  let data = null;

  if (req.url.startsWith(URI_USER_LOGIN)) {
    data = [req.url];
  }
  
  if (req.url.startsWith(URI_GOODS)) {
    data = req.url.substring(URI_GOODS.length).split('?');
  }
  const [uri, query] = data;
  const queryParams = {};
  if (query) {
    for (const piece of query.split('&')) {
      const [key, value] = piece.split('=');
      queryParams[key] = value ? decodeURIComponent(value) : '';
    }
  }

  try {
    const body = await (async () => {
      if (uri === '' || uri === '/') {
        if (req.url.startsWith(URI_USER_LOGIN)) {
          if (req.method === 'GET') return getUserId(uri);
        }
        if (req.method === 'GET') return getGoodsList(queryParams);
        if (req.method === 'POST') {
          const createdItem = await createGoods(await drainJson(req));
          res.statusCode = 201;
          res.setHeader('Access-Control-Expose-Headers', 'Location');
          res.setHeader('Location', `${URI_GOODS}/${createdItem.id}`);
          return createdItem;
        }
      } else {
        const itemId = uri.substring(1);
        if (req.url.startsWith(URI_USER_LOGIN)) {
          if (req.method === 'GET') return getUserId(uri);
        }
        if (req.method === 'GET') return getGoods(itemId);
        if (req.method === 'PATCH') return updateGoods(itemId, await drainJson(req));
      }
      return null;
    })();
    res.end(JSON.stringify(body));
  } catch (err) {
    if (err instanceof ApiError) {
      res.writeHead(err.statusCode);
      res.end(JSON.stringify(err.data));
    } else {
      res.statusCode = 500;
      res.end(JSON.stringify({message: 'Server Error'}));
      console.error(err);
    }
  }
})
  .on('listening', () => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Сервер CMS запущен. Вы можете использовать его по адресу http://localhost:${PORT}`);
    }
  })
  .listen(PORT);