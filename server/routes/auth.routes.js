// server/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller'); // Controller-ları import edirik
const isAuthenticated = require('../middleware/isAuthenticated'); // Middleware-i import edirik

// Qeydiyyat yolu
router.post('/register', authController.registerUser);

// Giriş yolu
router.post('/login', authController.loginUser);

// Çıxış yolu
router.post('/logout', authController.logoutUser);

// Autentifikasiya yoxlama yolu
router.get('/check-auth', authController.checkAuthStatus);

// Profil yeniləmə yolu (qorunan)
router.put('/profile/:nickname', isAuthenticated, authController.updateUserProfile);

module.exports = router; // Routeri export edirik
