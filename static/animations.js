// static/animations.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 粒子背景動畫 ---
    const canvas = document.getElementById('canvas-bg');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.7; // 速度稍慢
                this.vy = (Math.random() - 0.5) * 0.7;
                this.size = Math.random() * 1.5 + 0.5; // 更細小的粒子
                this.alpha = Math.random() * 0.4 + 0.1; // 透明度降低
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }
            draw() {
                ctx.fillStyle = `rgba(0, 243, 255, ${this.alpha})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 根據螢幕寬度決定粒子數量
        const particleCount = window.innerWidth < 768 ? 50 : 100;
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            requestAnimationFrame(animate);
        }
        animate();
    }

    // --- 2. 打字機效果 (僅在 index.html 作用) ---
    const typewriterElement = document.getElementById('typewriter');
    if (typewriterElement) {
        const text = typewriterElement.getAttribute('data-text') || "AI INTELLIGENCE DEFENSE";
        let i = 0;
        function type() {
            if (i < text.length) {
                typewriterElement.innerHTML += text.charAt(i);
                i++;
                setTimeout(type, 100);
            } else {
                // 打字結束後，加上霓虹燈效
                typewriterElement.classList.add('neon-text');
                // 讓游標在最後閃爍
                const cursor = document.querySelector('.cursor');
                if(cursor) cursor.style.display = 'inline-block';
            }
        }
        
        // 延遲開始
        setTimeout(type, 500);
    }
});
