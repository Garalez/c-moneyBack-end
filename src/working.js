const {existsSync, mkdirSync, readFileSync, writeFileSync, writeFile} = require('fs');
const {createServer} = require('http');

const DB_GOODS = process.env.DB_GOODS || './db_goods.json';
const PORT = process.env.PORT || 3000;
const URI_GOODS = '/api/goods';
const URI_CATEGORY = '/api/category';

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

function makeGoodsFromData(data, id) {
  const errors = [];

  function asString(str) {
    return str && String(str).trim() || '';
  }

  function isNumber(num) {
    return !Number.isNaN(parseFloat(num)) && isFinite(num)
  }

  const goods = {
    name: asString(data.name),
    login: asString(data.login),
    password: asString(data.password),
    amount: data.amount,
  };

  if (errors.length) throw new ApiError(422, {errors});

  return goods;
}

function getCategoryList() {
    const goods = JSON.parse(readFileSync(DB_GOODS) || "[]");
    const category = [...new Set(goods.map(item => item.category))];
    return category;

}

function getDiscountList() {
  const goods = JSON.parse(readFileSync(DB_GOODS) || '[]');
  return goods.filter(item => item.discount);
}

function getGoodsList(params = {}) {
  const goods = JSON.parse(readFileSync(DB_GOODS) || '[]');
  if (params.search) {
    const search = params.search.trim().toLowerCase();
    return goods.filter(goods => [
        goods.title,
        goods.description,
      ].some(str => str.toLowerCase().includes(search))
    );
  }
  return goods;
}

function getGoodsCategorytList(category) {
  console.log('category: ', category);
  if (!category) return getGoodsList();
  const goods = JSON.parse(readFileSync(DB_GOODS) || '[]');
  if (!goods) throw new ApiError(404, {message: 'Goods Not Found'});
  return goods.filter(item => decodeURI(item.category) === decodeURI(category));
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
  const goods = getGoodsList().find(({id}) => id === itemId);
  if (!goods) throw new ApiError(404, {message: 'Goods Not Found'});
  return goods;
}

function updateGoods(itemId, data) {
  const goods = getGoodsList();
  const itemIndex = goods.findIndex(({id}) => id === itemId);
  if (itemIndex === -1) throw new ApiError(404, {message: 'Goods Not Found'});
  Object.assign(goods[itemIndex], makeGoodsFromData({...goods[itemIndex], ...data}, itemId));
  writeFileSync(DB_GOODS, JSON.stringify(goods), {encoding: 'utf8'});
  return goods[itemIndex];
}

function deleteGoods(itemId) {
  const goods = getGoodsList();
  const itemIndex = goods.findIndex(({id}) => id === itemId);
  if (itemIndex === -1) throw new ApiError(404, {message: 'Goods Not Found'});
  goods.splice(itemIndex, 1);
  writeFileSync(DB_GOODS, JSON.stringify(goods), {encoding: 'utf8'});
  return {};
}

if (!existsSync(DB_GOODS)) writeFileSync(DB_GOODS, '[]', {encoding: 'utf8'});

module.exports = createServer(async (req, res) => {

  if  (req.url.substring(1, 6) === 'image') {
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    require("fs").readFile(`.${req.url}`, (err, image) => {
      res.end(image);
    });
    return;
  }

  res.setHeader('Content-Type', 'application/json');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  if (!req.url || (!req.url.startsWith(URI_GOODS) && !req.url.startsWith(URI_CATEGORY))) {
    res.statusCode = 404;
    res.end(JSON.stringify({message: 'Not Found'}));
    return;
  }

  let data = null;
  if (req.url.startsWith(URI_CATEGORY)) {
    data = [URI_CATEGORY];
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
      if (uri === URI_CATEGORY) {
        if (req.method === 'GET') return getCategoryList();
      }
      if (uri === '/discount') {
        return getDiscountList();
      }
      if (/^\/category\/*/.test(uri)) {
        return getGoodsCategorytList(uri.replace(/^\/category\//, ''));
      }
      if (uri === '' || uri === '/') {
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
        if (req.method === 'GET') return getGoods(itemId);
        if (req.method === 'PATCH') return updateGoods(itemId, await drainJson(req));
        if (req.method === 'DELETE') return deleteGoods(itemId);
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