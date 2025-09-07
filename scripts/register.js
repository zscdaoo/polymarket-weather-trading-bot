// Register Page Specific Scripts
document.addEventListener('DOMContentLoaded', function() {
    // Toggle password visibility
    document.getElementById('togglePassword').addEventListener('click', function() {
        togglePasswordVisibility('password', this);
    });

    document.getElementById('toggleConfirmPassword').addEventListener('click', function() {
        togglePasswordVisibility('confirmPassword', this);
    });

    function togglePasswordVisibility(inputId, element) {
        const passwordInput = document.getElementById(inputId);
        const icon = element.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.replace('bx-hide', 'bx-show');
        } else {
            passwordInput.type = 'password';
            icon.classList.replace('bx-show', 'bx-hide');
        }
    }

    // Phone mask
    document.getElementById('phone').addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value.length > 11) {
            value = value.slice(0, 11);
        }
        
        if (value.length > 10) {
            value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (value.length > 6) {
            value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        } else if (value.length > 2) {
            value = value.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        } else if (value.length > 0) {
            value = value.replace(/(\d{0,2})/, '($1');
        }
        
        e.target.value = value;
    });

    // Register form submission
    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const terms = document.getElementById('terms').checked;
        
        // Validation
        if (!terms) {
            authSystem.showToast('Você deve aceitar os termos e condições', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            authSystem.showToast('As senhas não coincidem', 'error');
            return;
        }
        
        if (password.length < 6) {
            authSystem.showToast('A senha deve ter pelo menos 6 caracteres', 'error');
            return;
        }
        
        if (!validateEmail(email)) {
            authSystem.showToast('E-mail inválido', 'error');
            return;
        }
        
        // Show loading state
        const submitBtn = this.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading"></div> Criando conta...';
        submitBtn.disabled = true;
        
        try {
            const result = await authSystem.register({ name, email, phone, password });
            
            if (!result.success) {
                // Manually handle redirection if auto-login fails
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            }
        } catch (error) {
            console.error('Register error:', error);
        } finally {
            // Restore button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // Email validation
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Check if user is already logged in
    if (authSystem.getToken()) {
        window.location.href = 'index.html';
    }
});