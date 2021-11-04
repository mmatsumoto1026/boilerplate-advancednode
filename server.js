'use strict';
require('dotenv').config();
const routes = require('./routes.js');
const auth = require('./auth.js');
const express = require('express');
const myDB = require('./connection');
const fccTesting = require('./freeCodeCamp/fcctesting.js');
const session = require('express-session');
const passport = require('passport');
const passportSocketIo = require('passport.socketio');
const MongoStore = require('connect-mongo')(session);
const URI = process.env.MONGO_URI;
const store = new MongoStore({ url: URI });
const cookieParser = require('cookie-parser'); 

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);


fccTesting(app); //For FCC testing purposes
app.use('/public', express.static(process.cwd() + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'pug');

app.use(session({
  key: 'express.sid',
  secret: process.env.SESSION_SECRET,
  resave: true,
  store: store,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session()); 

myDB(async client => {
  const myDataBase = await client.db('Cluster0').collection('users');

  // instantiate routes and auth
  routes(app, myDataBase);
  auth(app, myDataBase);

  app.use((req, res, next) => {
    res.status(404)
      .type('text')
      .send('Not Found');
  });

  function onAuthorizeSuccess(data, accept) {
    console.log('successful connection to socket.io');

    accept(null, true);
  }

  function onAuthorizeFail(data, message, error, accept) {
    if (error) throw new Error(message);
    console.log('failed connection to socket.io:', message);
    accept(null, false);
  }


  io.use(
    passportSocketIo.authorize({
      cookieParser: cookieParser,
      key: 'express.sid',
      secret: process.env.SESSION_SECRET,
      store: store,
      success: onAuthorizeSuccess,
      fail: onAuthorizeFail
    })
  );

  let currentUsers = 0;

  io.on('connection', socket => {
    ++currentUsers;
    //io.emit('user count', currentUsers);

    //announce New Users
    io.emit('user', {
      name: socket.request.user.username,
      currentUsers,
      connected: true
    });
    console.log('A user has connected');
    console.log('user ' + socket.request.user.username + ' connected');

    socket.on('disconnect', () => {
      --currentUsers;

      //announce New Users
      io.emit('user', {
        name: socket.request.user.username,
        currentUsers,
        connected: false
      });
      io.emit('user count', currentUsers);
      console.log('A user disconnected!')
    });

    socket.on('chat message', message => {
      io.emit('chat message', {
        name: socket.request.user.username,
        message: message
      })
    });
  });
}).catch(e => {
  app.route('/').get((req, res) => {
    res.render('pug', { title: e, message: 'Unable to login' });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('Listening on port ' + PORT);
});