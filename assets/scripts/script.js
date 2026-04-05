// Mobile menu functionality
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navList = document.querySelector('.nav-list');
    
    // Toggle mobile menu
    mobileMenuToggle.addEventListener('click', function() {
        navList.classList.toggle('active');
        
        // Animate hamburger menu
        const spans = this.querySelectorAll('span');
        spans.forEach(span => span.classList.toggle('active'));
    });

    // Close mobile menu when clicking on a link
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            navList.classList.remove('active');
        });
    });

    // Smooth scrolling for navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // If it's a hash link (like #bocker), handle smooth scrolling
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(href);
                
                if (targetSection) {
                    const headerHeight = document.querySelector('.header').offsetHeight;
                    const targetPosition = targetSection.offsetTop - headerHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
            // If it's a full URL with hash (like /#bocker), handle navigation
            else if (href.includes('#') && href.startsWith('/')) {
                const hash = href.split('#')[1];
                const currentPath = window.location.pathname;
                
                // If we're already on the home page, just scroll to the section
                if (currentPath === '/') {
                    e.preventDefault();
                    const targetSection = document.querySelector('#' + hash);
                    
                    if (targetSection) {
                        const headerHeight = document.querySelector('.header').offsetHeight;
                        const targetPosition = targetSection.offsetTop - headerHeight;
                        
                        window.scrollTo({
                            top: targetPosition,
                            behavior: 'smooth'
                        });
                    }
                }
                // If we're on a different page, let the browser navigate
                // The handleCrossPageNavigation function will handle the scrolling
            }
        });
    });

    // Handle navigation from other pages to home page sections
    function handleCrossPageNavigation() {
        const hash = window.location.hash;
        if (hash) {
            // Wait for page to load, then scroll to section
            setTimeout(() => {
                const targetSection = document.querySelector(hash);
                if (targetSection) {
                    const headerHeight = document.querySelector('.header').offsetHeight;
                    const targetPosition = targetSection.offsetTop - headerHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    }

    // Call the function when page loads
    handleCrossPageNavigation();

    // Active navigation highlighting
    function updateActiveNav() {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.nav-link');
        
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            const headerHeight = document.querySelector('.header').offsetHeight;
            
            if (window.pageYOffset >= (sectionTop - headerHeight - 200)) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    }

    // Update active navigation on scroll
    window.addEventListener('scroll', updateActiveNav);
    
    // Initial active navigation
    updateActiveNav();

    // Header scroll effect
    const header = document.querySelector('.header');
    let lastScrollTop = 0;
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > 100) {
            header.style.background = 'rgba(255, 255, 255, 0.95)';
            header.style.backdropFilter = 'blur(10px)';
        } else {
            header.style.background = '#fff';
            header.style.backdropFilter = 'none';
        }
        
        lastScrollTop = scrollTop;
    });

    // Contact form handling
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const name = formData.get('name');
            const email = formData.get('email');
            const subject = formData.get('subject');
            const message = formData.get('message');
            
            // Basic validation
            if (!name || !email || !message) {
                showNotification('Vänligen fyll i alla obligatoriska fält.', 'error');
                return;
            }
            
            if (!isValidEmail(email)) {
                showNotification('Vänligen ange en giltig e-postadress.', 'error');
                return;
            }
            
            // Show loading state
            const submitButton = this.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.textContent = 'Skickar...';
            submitButton.disabled = true;
            
            try {
                // Send form data to server
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        subject,
                        message
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showNotification(result.message, 'success');
                    this.reset();
                } else {
                    showNotification(result.error || 'Ett fel uppstod. Försök igen.', 'error');
                }
            } catch (error) {
                console.error('Contact form error:', error);
                showNotification('Ett fel uppstod vid skickande av meddelandet. Försök igen.', 'error');
            } finally {
                // Reset button state
                submitButton.textContent = originalText;
                submitButton.disabled = false;
            }
        });
    }

    // Email validation
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Notification system
    function showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 400px;
            animation: slideInRight 0.3s ease-out;
        `;
        
        // Add animation keyframes
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add to page
        document.body.appendChild(notification);
        
        // Close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', function() {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // Smooth reveal animation for sections
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe sections below the hero (hero must paint immediately for LCP)
    const sections = document.querySelectorAll('section:not(#hem)');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        observer.observe(section);
    });

    // CTA button functionality
    // CTA button now links directly to book page, no JavaScript needed

    // Content loading functions
    async function loadBooks() {
        try {
            const response = await fetch('/api/books');
            const books = await response.json();
            
            const container = document.getElementById('books-container');
            
            // Exit early if books container doesn't exist (e.g., on book details page)
            if (!container) {
                return;
            }
            
            if (books.length === 0) {
                container.innerHTML = '<div class="no-content">Inga böcker tillgängliga än</div>';
                return;
            }
            
            const booksHTML = books.map(book => {
                const hasPrice = book.price && book.price > 0;
                
                return `
                <div class="book-card" data-book-id="${book.id}" style="cursor: pointer;">
                    <div class="book-cover">
                        ${book.cover_image ? 
                            `<img src="${book.cover_image}" alt="${book.title}" loading="lazy" decoding="async" width="280" height="400">` : 
                            `<h3>${book.title}</h3>${book.subtitle ? `<p class="book-subtitle">${book.subtitle}</p>` : ''}`
                        }
                    </div>
                    <div class="book-info">
                        <h4>${book.title}</h4>
                        <div class="book-price" style="${hasPrice ? '' : 'visibility: hidden; height: 2.5rem;'}">
                            ${hasPrice ? `<span class="price-amount">${book.price} SEK</span>` : ''}
                        </div>
                        <div class="book-actions" style="${hasPrice ? '' : 'visibility: hidden; height: 2.5rem;'}">
                            ${hasPrice ? `<a href="/purchase/${book.id}" class="btn-purchase" style="background: #e74c3c !important; color: white !important; display: block !important; padding: 0.6rem 1rem !important; text-align: center !important; text-decoration: none !important; border-radius: 5px !important; font-weight: 600 !important;">Köp</a>` : ''}
                        </div>
                    </div>
                </div>
            `;
            }).join('');
            
            container.innerHTML = booksHTML;
            
            // Add event listeners for book cards
            const bookCards = container.querySelectorAll('.book-card');
            bookCards.forEach(card => {
                card.addEventListener('click', function(e) {
                    // Don't navigate if clicking on the purchase button
                    if (e.target.classList.contains('btn-purchase')) {
                        return;
                    }
                    const bookId = this.getAttribute('data-book-id');
                    window.location.href = `/book/${bookId}`;
                });
            });
        } catch (error) {
            console.error('❌ Error loading books:', error);
            const container = document.getElementById('books-container');
            if (container) {
                container.innerHTML = '<div class="error">Kunde inte ladda böcker</div>';
            }
        }
    }


    async function loadBlogPosts() {
        try {
            const response = await fetch('/api/blog');
            const posts = await response.json();
            
            const container = document.getElementById('blog-container');
            
            // Exit early if blog container doesn't exist (e.g., on book details page)
            if (!container) {
                return;
            }
            
            if (posts.length === 0) {
                container.innerHTML = '<div class="no-content">Inga blogginlägg tillgängliga än</div>';
                return;
            }
            
            const postsHTML = posts.map(post => `
                <article class="blog-post" data-blog-id="${post.id}" style="cursor: pointer;">
                    <div class="blog-date">${new Date(post.created_at).toLocaleDateString('sv-SE')}</div>
                    <h3>${post.title}</h3>
                    ${post.excerpt ? `<p>${post.excerpt}</p>` : ''}
                    <a href="/blog/${post.id}" class="read-more">Läs mer</a>
                </article>
            `).join('');
            
            container.innerHTML = postsHTML;
            
            // Add event listeners for blog posts
            const blogPosts = container.querySelectorAll('.blog-post');
            blogPosts.forEach(post => {
                post.addEventListener('click', function(e) {
                    // Don't navigate if clicking on the read-more link
                    if (e.target.classList.contains('read-more')) {
                        return;
                    }
                    const blogId = this.getAttribute('data-blog-id');
                    window.location.href = `/blog/${blogId}`;
                });
            });
        } catch (error) {
            console.error('❌ Error loading blog posts:', error);
            const container = document.getElementById('blog-container');
            if (container) {
                container.innerHTML = '<div class="error">Kunde inte ladda blogginlägg</div>';
            }
        }
    }

    // Load content when page loads
    loadBooks();
    loadBlogPosts();

    // Add loading animation
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });
});

// Add some additional CSS for notifications
const additionalStyles = `
    .notification-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }
    
    .notification-close:hover {
        opacity: 0.8;
    }
    
    .notification-message {
        flex: 1;
    }
`;

// Inject additional styles
if (!document.querySelector('#additional-styles')) {
    const style = document.createElement('style');
    style.id = 'additional-styles';
    style.textContent = additionalStyles;
    document.head.appendChild(style);
}
