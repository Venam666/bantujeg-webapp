/**
 * CRASH SHIELD - Isolate Runtime from fatal errors.
 * 
 * Ensures the app never stops working even if:
 * - Network fails
 * - Logic throws exception
 * - DOM is missing
 * 
 * Usage:
 * window.__APP_SAFE_CALL(() => { ...code... });
 */

window.__APP_SAFE_CALL = async function (fn, context = 'unnamed') {
    try {
        const result = fn();
        if (result instanceof Promise) {
            return await result.catch(err => {
                console.error(`[CRASH SHIELD] Async Error in ${context}:`, err);
                window.__APP_CRASH_REPORT(err, context);
                return null; // Return null on failure, do not throw
            });
        }
        return result;
    } catch (err) {
        console.error(`[CRASH SHIELD] Sync Error in ${context}:`, err);
        window.__APP_CRASH_REPORT(err, context);
        return null; // Return null on failure
    }
};

window.__APP_CRASH_REPORT = function (err, context) {
    // In production, this would send to Sentry/LogRocket
    // For now, minimal UI feedback if critical
    const isCritical = /Network|Fetch|Pricing|Payment/i.test(context) || /Network|Fetch|Pricing|Payment/i.test(err.message);

    if (isCritical) {
        const errCard = document.getElementById('error-card');
        if (errCard) {
            errCard.style.display = 'block';
            errCard.innerText = `⚠️ System unstable: ${context}`;
        }
    }
};

console.log("🛡️ Crash Shield Activated");
