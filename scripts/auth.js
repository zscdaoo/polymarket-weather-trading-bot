// Authentication System
class AuthSystem {
    constructor() {
        this.tokenKey = 'authToken';
        this.userKey = 'userData';
        
        // ⭐⭐ URL DO SEU BACKEND NO RAILWAY - SUBSTITUA PELA SUA URL ⭐⭐
        this.API_BASE_URL = 'https://ecommerce-kushi-production.up.railway.app';
        
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
    }

    // Check if user is authenticated
    checkAuth() {
        const token = this.getToken();
        const userData = this.getUserData();
        
        if (token && userData) {
            this.showUserLogged(userData);
            this.updateFooterLinks(true);
        } else {
            this.showLoginIcon();
            this.updateFooterLinks(false);
        }
    }

    // Get authentication token
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    // Get user data
    getUserData() {
        const userData = localStorage.getItem(this.userKey);
        return userData ? JSON.parse(userData) : null;
    }

    // Save authentication data
    saveAuthData(token, userData) {
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.userKey, JSON.stringify(userData));
        this.checkAuth();
    }

    // Remove authentication data
    removeAuthData() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        this.checkAuth();
    }

    // Show user logged in state
    showUserLogged(userData) {
        const loginIcon = document.getElementById('loginIcon');
        const userLogged = document.getElementById('userLogged');
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');
        const menuUserName = document.getElementById('menuUserName');
        const menuUserEmail = document.getElementById('menuUserEmail');
        const menuAvatar = document.getElementById('menuAvatar');
        
        if (loginIcon) loginIcon.style.display = 'none';
        if (userLogged) userLogged.style.display = 'flex';
        if (userName) userName.textContent = userData.name;
        if (userAvatar) userAvatar.src = userData.avatar || 'https://placehold.co/100x100/3498db/white?text=U';
        if (menuUserName) menuUserName.textContent = userData.name;
        if (menuUserEmail) menuUserEmail.textContent = userData.email;
        if (menuAvatar) menuAvatar.src = userData.avatar || 'https://placehold.co/100x100/3498db/white?text=U';
    }

    // Show login icon
    showLoginIcon() {
        const loginIcon = document.getElementById('loginIcon');
        const userLogged = document.getElementById('userLogged');
        
        if (loginIcon) loginIcon.style.display = 'block';
        if (userLogged) userLogged.style.display = 'none';
    }

    // Update footer links based on auth state
    updateFooterLinks(isLoggedIn) {
        const footerLogin = document.getElementById('footerLogin');
        const footerRegister = document.getElementById('footerRegister');
        const footerLogout = document.getElementById('footerLogout');
        
        if (footerLogin) footerLogin.style.display = isLoggedIn ? 'none' : 'block';
        if (footerRegister) footerRegister.style.display = isLoggedIn ? 'none' : 'block';
        if (footerLogout) footerLogout.style.display = isLoggedIn ? 'block' : 'none';
    }

    // Setup event listeners
    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Footer logout
        const footerLogout = document.getElementById('footerLogout');
        if (footerLogout) {
            footerLogout.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // User menu toggle
        const userLogged = document.getElementById('userLogged');
        const userMenu = document.getElementById('userMenu');
        
        if (userLogged && userMenu) {
            userLogged.addEventListener('click', (e) => {
                e.stopPropagation();
                userMenu.style.display = userMenu.style.display === 'block' ? 'none' : 'block';
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!userMenu.contains(e.target) && !userLogged.contains(e.target)) {
                    userMenu.style.display = 'none';
                }
            });
        }
    }

    // Logout function
    logout() {
        this.removeAuthData();
        this.showToast('Logout realizado com sucesso!', 'success');
        
        // Redirect to home if not already there
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
    }

    // Show toast notification
    showToast(message, type = 'info') {
        // Create toast element if it doesn't exist
        let toast = document.getElementById('auth-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'auth-toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.className = toast.className.replace('show', '');
        }, 3000);
    }

    // Login function
    async login(email, password) {
        try {
            // ⭐⭐ URL COMPLETA DO BACKEND ⭐⭐
            const response = await fetch(`${this.API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.saveAuthData(data.token, data.user);
                this.showToast('Login realizado com sucesso!', 'success');
                
                // Redirecionar para a página inicial após login
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
                
                return { success: true, data };
            } else {
                this.showToast(data.message || 'Erro ao fazer login', 'error');
                return { success: false, error: data.message };
            }
        } catch (error) {
            this.showToast('Erro de conexão. Tente novamente.', 'error');
            return { success: false, error: 'Connection error' };
        }
    }

    // Register function
    async register(userData) {
        try {
            // ⭐⭐ URL COMPLETA DO BACKEND ⭐⭐
            const response = await fetch(`${this.API_BASE_URL}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast('Conta criada com sucesso!', 'success');
                
                // Fazer login automático após cadastro
                const loginResult = await this.login(userData.email, userData.password);
                
                if (loginResult.success) {
                    return { success: true, data };
                } else {
                    // Se o login automático falhar, redirecionar para login
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 1500);
                    return { success: true, data };
                }
            } else {
                this.showToast(data.message || 'Erro ao criar conta', 'error');
                return { success: false, error: data.message };
            }
        } catch (error) {
            this.showToast('Erro de conexão. Tente novamente.', 'error');
            return { success: false, error: 'Connection error' };
        }
    }

    // Check if user is logged in (for page protection)
    requireAuth() {
        const token = this.getToken();
        if (!token && window.location.pathname.includes('dashboard')) {
            window.location.href = 'login.html';
        }
    }

    // Password recovery function
    async forgotPassword(email) {
        try {
            // ⭐⭐ URL COMPLETA DO BACKEND ⭐⭐
            const response = await fetch(`${this.API_BASE_URL}/api/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast('Instruções enviadas para seu e-mail!', 'success');
                return { success: true, data };
            } else {
                this.showToast(data.message || 'Erro ao enviar e-mail', 'error');
                return { success: false, error: data.message };
            }
        } catch (error) {
            this.showToast('Erro de conexão. Tente novamente.', 'error');
            return { success: false, error: 'Connection error' };
        }
    }

    // Reset password function
    async resetPassword(token, newPassword) {
        try {
            // ⭐⭐ URL COMPLETA DO BACKEND ⭐⭐
            const response = await fetch(`${this.API_BASE_URL}/api/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token, newPassword })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast('Senha redefinida com sucesso!', 'success');
                return { success: true, data };
            } else {
                this.showToast(data.message || 'Erro ao redefinir senha', 'error');
                return { success: false, error: data.message };
            }
        } catch (error) {
            this.showToast('Erro de conexão. Tente novamente.', 'error');
            return { success: false, error: 'Connection error' };
        }
    }
}

// Initialize auth system
const auth = new AuthSystem();

// Export for use in other files
window.authSystem = auth;