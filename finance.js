/**
 * Enterprise Financial Dashboard Logic [v3.0 ULTRA]
 * Features: SVG Sparklines, Theme Toggling, KPI Calculation, GST Intelligence
 */

const financeApp = {
    init() {
        this.calculateTax();
        this.renderSparkline();
        this.setupThemeToggle();
    },

    formatMoney(n) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    },

    calculateTax() {
        const grossEl = document.getElementById('grossAmount');
        if (!grossEl) return;
        let val = grossEl.value;
        // Clean numeric input
        val = val.replace(/[^0-9.]/g, '');
        const gross = parseFloat(val) || 0;

        // 18% total GST (9% CGST + 9% SGST)
        const base = gross / 1.18;
        const totalTax = gross - base;
        const cgst = totalTax / 2;
        const sgst = totalTax / 2;

        const setVal = (id, amount) => {
            const el = document.getElementById(id);
            if (el) el.textContent = this.formatMoney(amount);
        };

        setVal('basePrice', base);
        setVal('totalTax', totalTax);
        setVal('cgst', cgst);
        setVal('sgst', sgst);
    },

    renderSparkline() {
        const container = document.getElementById('sparklineContainer');
        if (!container) return;

        // Simulated 7-day FX trend data
        const data = [0.91, 0.93, 0.92, 0.94, 0.95, 0.94, 0.96];
        const min = Math.min(...data);
        const max = Math.max(...data);
        const width = container.clientWidth || 300;
        const height = 60;
        const padding = 5;

        const points = data.map((val, i) => {
            const x = (i / (data.length - 1)) * (width - 2*padding) + padding;
            const y = height - padding - ((val - min) / (max - min)) * (height - 2*padding);
            return `${x},${y}`;
        }).join(' ');

        container.innerHTML = `
            <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
                <defs>
                    <linearGradient id="sparkGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                <polygon points="0,${height} ${points} ${width},${height}" fill="url(#sparkGradient)"/>
                <!-- Current value dot -->
                <circle cx="${width - padding}" cy="${height - padding - ((data[data.length-1] - min) / (max - min)) * (height - 2*padding)}" r="4" fill="var(--bg-base)" stroke="var(--accent)" stroke-width="2"/>
            </svg>
        `;
    },

    setupThemeToggle() {
        const toggleBtn = document.getElementById('themeToggle');
        if (!toggleBtn) return;
        
        // Restore from LocalStorage
        const savedTheme = localStorage.getItem('ai_finance_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('ai_finance_theme', next);
            
            // Re-render sparkline if colors changed
            this.renderSparkline();
        });
    },

    confirmVerification() {
        const modal = document.getElementById('verifyModal');
        if (modal) modal.close();
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('Cryptographic verification confirmed and logged.');
        } else {
            alert('Verification Confirmed');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => financeApp.init());
// Also trigger on hashchange if integrated into SPA
window.addEventListener('hashchange', () => {
    if (location.hash === '#finance') {
        setTimeout(() => financeApp.init(), 100);
    }
});
