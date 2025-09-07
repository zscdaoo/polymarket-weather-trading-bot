// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
    document.getElementById('resetToken').value = token;
} else {
    showToast('Token inválido ou expirado', 'error');
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 2000);
}

// Toggle password visibility
document.getElementById('toggleNewPassword').addEventListener('click', function() {
    togglePasswordVisibility('newPassword', this);
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

// Form submission
document.getElementById('resetPasswordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const token = document.getElementById('resetToken').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validation
    if (newPassword !== confirmPassword) {
        showToast('As senhas não coincidem', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('A senha deve ter pelo menos 6 caracteres', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Senha redefinida com sucesso!', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showToast(data.message || 'Erro ao redefinir senha', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão. Tente novamente.', 'error');
    }
});

// Toast notification function
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    
    if (type === 'error') {
        toast.style.backgroundColor = '#E53637';
    } else if (type === 'success') {
        toast.style.backgroundColor = '#4CAF50';
    } else {
        toast.style.backgroundColor = '#333';
    }
    
    setTimeout(function() {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}