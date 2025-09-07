// Login Page Specific Scripts
document.addEventListener('DOMContentLoaded', function() {
    // Toggle password visibility
    document.getElementById('togglePassword').addEventListener('click', function() {
        const passwordInput = document.getElementById('password');
        const icon = this.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.replace('bx-hide', 'bx-show');
        } else {
            passwordInput.type = 'password';
            icon.classList.replace('bx-show', 'bx-hide');
        }
    });

    // Forgot password modal
    const forgotPasswordLink = document.getElementById('forgotPassword');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const closeModal = document.querySelector('.close-modal');

    if (forgotPasswordLink && forgotPasswordModal) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            forgotPasswordModal.style.display = 'block';
        });

        closeModal.addEventListener('click', function() {
            forgotPasswordModal.style.display = 'none';
        });

        window.addEventListener('click', function(e) {
            if (e.target === forgotPasswordModal) {
                forgotPasswordModal.style.display = 'none';
            }
        });
    }

    // Login form submission
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember').checked;
        
        // Show loading state
        const submitBtn = this.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading"></div> Entrando...';
        submitBtn.disabled = true;
        
        try {
            const result = await authSystem.login(email, password);
            
            if (result.success && remember) {
                // Se "Lembrar-me" estiver marcado, salvar por mais tempo
                localStorage.setItem('rememberMe', 'true');
            }
        } catch (error) {
            console.error('Login error:', error);
        } finally {
            // Restore button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // Forgot password form
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('recoveryEmail').value;
            
            // Simulate password reset (em produção, integraria com API)
            authSystem.showToast('Instruções enviadas para seu e-mail!', 'success');
            
            setTimeout(() => {
                forgotPasswordModal.style.display = 'none';
            }, 2000);
        });
    }

    // Check if user is already logged in
    if (authSystem.getToken()) {
        window.location.href = 'index.html';
    }
});