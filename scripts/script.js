// Main JavaScript for Kushi E-commerce
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all functionality
    initNavigation();
    initSmoothScroll();
    initAnimations();
    initProductInteractions();
    initNewsletter();
});

// Navigation functionality
function initNavigation() {
    const header = document.querySelector("header");
    const menuIcon = document.getElementById('menu-icon');
    const navigation = document.querySelector('.navigation');

    // Sticky header
    window.addEventListener("scroll", function() {
        header.classList.toggle("sticky", window.scrollY > 50);
    });

    // Mobile menu toggle
    if (menuIcon && navigation) {
        menuIcon.addEventListener('click', () => {
            menuIcon.classList.toggle('bx-x');
            navigation.classList.toggle('open');
            
            // Animate menu items
            const navItems = navigation.querySelectorAll('li');
            navItems.forEach((item, index) => {
                item.style.animation = navigation.classList.contains('open') 
                    ? `slideInRight 0.3s ease forwards ${index * 0.1}s`
                    : '';
            });
        });
    }

    // Close menu when clicking on links
    const navLinks = document.querySelectorAll('.navigation a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                menuIcon.classList.remove('bx-x');
                navigation.classList.remove('open');
            }
        });
    });
}

// Smooth scroll functionality
function initSmoothScroll() {
    const scrollLinks = document.querySelectorAll('a[href^="#"]');
    
    scrollLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerHeight = document.querySelector('header').offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Animations
function initAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature, .product-card, .stat');
    animateElements.forEach(el => observer.observe(el));
}

// Product interactions
function initProductInteractions() {
    // Add to cart functionality
    const addToCartButtons = document.querySelectorAll('.product-actions button:last-child');
    addToCartButtons.forEach(button => {
        button.addEventListener('click', function() {
            const productCard = this.closest('.product-card');
            const productName = productCard.querySelector('h3').textContent;
            const productPrice = productCard.querySelector('.current-price').textContent;
            
            addToCart(productName, productPrice);
        });
    });

    // Quick view functionality
    const quickViewButtons = document.querySelectorAll('.quick-view');
    quickViewButtons.forEach(button => {
        button.addEventListener('click', function() {
            const productCard = this.closest('.product-card');
            const productName = productCard.querySelector('h3').textContent;
            
            showQuickView(productName);
        });
    });

    // Wishlist functionality
    const wishlistButtons = document.querySelectorAll('.product-actions button:first-child');
    wishlistButtons.forEach(button => {
        button.addEventListener('click', function() {
            const productCard = this.closest('.product-card');
            const productName = productCard.querySelector('h3').textContent;
            
            toggleWishlist(productName, this);
        });
    });
}

// Cart functionality
function addToCart(productName, productPrice) {
    // Update cart count
    const cartCount = document.querySelector('.cart-count');
    let count = parseInt(cartCount.textContent) || 0;
    count++;
    cartCount.textContent = count;
    cartCount.style.display = 'block';
    
    // Show success message
    showToast(`"${productName}" adicionado ao carrinho!`, 'success');
    
    // Animate cart icon
    const cartIcon = document.querySelector('.cart-icon');
    cartIcon.classList.add('animate');
    setTimeout(() => cartIcon.classList.remove('animate'), 500);
}

// Wishlist functionality
function toggleWishlist(productName, button) {
    button.classList.toggle('active');
    
    if (button.classList.contains('active')) {
        showToast(`"${productName}" adicionado aos favoritos!`, 'success');
        button.innerHTML = '<i class="bx bxs-heart"></i>';
    } else {
        showToast(`"${productName}" removido dos favoritos!`, 'info');
        button.innerHTML = '<i class="bx bx-heart"></i>';
    }
}

// Quick view modal
function showQuickView(productName) {
    // In a real implementation, this would show a modal with product details
    showToast(`Visualizando: ${productName}`, 'info');
}

// Newsletter functionality
function initNewsletter() {
    const newsletterForm = document.querySelector('.newsletter-form');
    
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const emailInput = this.querySelector('input[type="email"]');
            const email = emailInput.value;
            
            if (validateEmail(email)) {
                // Simulate newsletter subscription
                setTimeout(() => {
                    showToast('Inscrição realizada com sucesso!', 'success');
                    emailInput.value = '';
                }, 1000);
            } else {
                showToast('Por favor, insira um e-mail válido.', 'error');
            }
        });
    }
}

// Email validation
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Toast notification system
function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize when page loads
window.addEventListener('load', function() {
    // Preload images
    preloadImages();
    
    // Initialize animations
    initScrollAnimations();
});

// Image preloading
function preloadImages() {
    const images = [
        'images/hero-model.png',
        'images/produto1.jpg',
        'images/produto2.jpg',
        'images/produto3.jpg',
        'images/produto4.jpg'
    ];
    
    images.forEach(src => {
        new Image().src = src;
    });
}

// Scroll animations
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.feature, .product-card, .stat');
    
    animatedElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease';
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

// Export functions for global access
window.ecommerce = {
    addToCart,
    toggleWishlist,
    showToast,
    validateEmail
};