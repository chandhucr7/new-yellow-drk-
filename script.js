document.addEventListener("DOMContentLoaded", function () {
    console.log("BTC & XAU Intraday Dashboard Loaded");

    // API Keys (Replace with your valid keys if these are expired)
    const alphaVantageKey = "goldapi-41bk03esm9iujmwx-io"; // Replaced with your provided API key
    const newsApiKey = "e65e835d2d754ee0b88387af19c0743e";

    // Store recent patterns and signals
    let btcRecentPatterns = [];
    let xauRecentPatterns = [];
    let btcRecentSignals = [];
    let xauRecentSignals = [];

    // Helper to safely query DOM
    function safeQuery(selector, context = document) {
        try {
            return context.querySelector(selector) || null;
        } catch (e) {
            console.error(`Error querying ${selector}:`, e);
            return null;
        }
    }

    // Calculate RSI
    function calculateRSI(prices, period = 14) {
        if (!prices || prices.length < period + 1 || prices.some(isNaN)) {
            console.warn("Invalid or insufficient data for RSI");
            return null;
        }
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            let diff = prices[i] - prices[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        if (avgLoss === 0) avgLoss = 0.0001;
        let rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // Calculate EMA
    function calculateEMA(prices, period) {
        if (!prices || prices.length < period || prices.some(isNaN)) {
            console.warn(`Invalid or insufficient data for EMA-${period}`);
            return [];
        }
        const k = 2 / (period + 1);
        let ema = [prices[0]];
        for (let i = 1; i < prices.length; i++) {
            ema.push(prices[i] * k + ema[i - 1] * (1 - k));
        }
        return ema;
    }

    // Calculate MACD
    function calculateMACD(prices) {
        if (!prices || prices.length < 26 || prices.some(isNaN)) {
            console.warn("Invalid or insufficient data for MACD");
            return { macd: [], signal: [], histogram: [] };
        }
        const ema12 = calculateEMA(prices, 12);
        const ema26 = calculateEMA(prices, 26);
        const macd = [];
        for (let i = 0; i < prices.length; i++) {
            macd.push(ema12[i] && ema26[i] ? ema12[i] - ema26[i] : null);
        }
        const validMacd = macd.filter(val => val !== null);
        const signal = calculateEMA(validMacd, 9);
        const histogram = validMacd.slice(-signal.length).map((val, i) => val - (signal[i] || 0));
        return { macd: validMacd.slice(-signal.length), signal, histogram };
    }

    // Calculate Bollinger Bands
    function calculateBollingerBands(prices, period = 20, stdDev = 2) {
        if (!prices || prices.length < period || prices.some(isNaN)) {
            console.warn("Invalid or insufficient data for Bollinger Bands");
            return { upper: [], middle: [], lower: [] };
        }
        const middle = [];
        const upper = [];
        const lower = [];
        for (let i = period - 1; i < prices.length; i++) {
            const slice = prices.slice(i - period + 1, i + 1);
            const avg = slice.reduce((sum, val) => sum + val, 0) / period;
            const std = Math.sqrt(slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period);
            middle.push(avg);
            upper.push(avg + stdDev * std);
            lower.push(avg - stdDev * std);
        }
        return { upper, middle, lower };
    }

    // Calculate ATR
    function calculateATR(candles, period = 14) {
        if (!candles || candles.length < period + 1) {
            console.warn("Invalid or insufficient data for ATR");
            return 0;
        }
        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = parseFloat(candles[i][2]);
            const low = parseFloat(candles[i][3]);
            const prevClose = parseFloat(candles[i - 1][4]);
            if (isNaN(high) || isNaN(low) || isNaN(prevClose)) continue;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
        }
        if (trs.length < period) return 0;
        return trs.slice(-period).reduce((sum, val) => sum + val, 0) / period;
    }

    // Detect candlestick patterns
    function detectPattern(candles, index) {
        if (!candles || index < 0 || index >= candles.length) {
            console.warn("Invalid candle index for pattern detection");
            return null;
        }
        const candle = {
            open: parseFloat(candles[index][1]),
            high: parseFloat(candles[index][2]),
            low: parseFloat(candles[index][3]),
            close: parseFloat(candles[index][4])
        };
        if ([candle.open, candle.high, candle.low, candle.close].some(isNaN)) return null;
        const body = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const totalRange = candle.high - candle.low;

        const prevCandle = index > 0 ? {
            open: parseFloat(candles[index - 1][1]),
            close: parseFloat(candles[index - 1][4]),
            high: parseFloat(candles[index - 1][2]),
            low: parseFloat(candles[index - 1][3])
        } : null;
        const prevBody = prevCandle ? Math.abs(prevCandle.close - prevCandle.open) : 0;

        if (body < totalRange * 0.1 && upperWick > body && lowerWick > body) {
            return { pattern: "Doji", confidence: "80%" };
        }
        if (lowerWick > body * 2 && upperWick < body && candle.close > candle.open) {
            return { pattern: "Hammer", confidence: "85%" };
        }
        if (prevCandle && prevCandle.close < prevCandle.open && candle.close > candle.open &&
            candle.close > prevCandle.open && candle.open < prevCandle.close &&
            body > prevBody) {
            return { pattern: "Bullish Engulfing", confidence: "75%" };
        }
        if (prevCandle && prevCandle.close < prevCandle.open && candle.close > candle.open &&
            candle.open < prevCandle.low && candle.close > (prevCandle.open + prevCandle.close) / 2) {
            return { pattern: "Piercing Line", confidence: "70%" };
        }
        if (index >= 2) {
            const candle2 = {
                open: parseFloat(candles[index - 1][1]),
                close: parseFloat(candles[index - 1][4]),
                high: parseFloat(candles[index - 1][2]),
                low: parseFloat(candles[index - 1][3])
            };
            const candle3 = {
                open: parseFloat(candles[index - 2][1]),
                close: parseFloat(candles[index - 2][4])
            };
            if (candle3.close < candle3.open &&
                Math.abs(candle2.close - candle2.open) < totalRange * 0.2 &&
                candle.close > candle.open && candle.close > candle3.close) {
                return { pattern: "Morning Star", confidence: "80%" };
            }
            if (candle.close > candle.open && candle2.close > candle2.open && candle3.close > candle3.open &&
                candle.close > candle2.close && candle2.close > candle3.close) {
                return { pattern: "Three White Soldiers", confidence: "85%" };
            }
        }
        if (upperWick > body * 2 && lowerWick < body && candle.close < candle.open) {
            return { pattern: "Shooting Star", confidence: "70%" };
        }
        if (prevCandle && prevCandle.close > prevCandle.open && candle.close < candle.open &&
            candle.close < prevCandle.open && candle.open > prevCandle.close &&
            body > prevBody) {
            return { pattern: "Bearish Engulfing", confidence: "75%" };
        }
        if (prevCandle && prevCandle.close > prevCandle.open && candle.close < candle.open &&
            candle.open > prevCandle.high && candle.close < (prevCandle.open + prevCandle.close) / 2) {
            return { pattern: "Dark Cloud Cover", confidence: "70%" };
        }
        if (index >= 2) {
            const candle2 = {
                open: parseFloat(candles[index - 1][1]),
                close: parseFloat(candles[index - 1][4]),
                high: parseFloat(candles[index - 1][2]),
                low: parseFloat(candles[index - 1][3])
            };
            const candle3 = {
                open: parseFloat(candles[index - 2][1]),
                close: parseFloat(candles[index - 2][4])
            };
            if (candle3.close > candle3.open &&
                Math.abs(candle2.close - candle2.open) < totalRange * 0.2 &&
                candle.close < candle.open && candle.close < candle3.close) {
                return { pattern: "Evening Star", confidence: "80%" };
            }
            if (candle.close < candle.open && candle2.close < candle2.open && candle3.close < candle3.open &&
                candle.close < candle2.close && candle2.close < candle3.close) {
                return { pattern: "Three Black Crows", confidence: "85%" };
            }
        }
        return null;
    }

    // Update recent patterns table
    function updateRecentPatternsTable(table, recentPatterns) {
        if (!table) {
            console.error("Recent patterns table not found");
            return;
        }
        table.innerHTML = recentPatterns.length > 0 ? recentPatterns.map(p => `
            <tr>
                <td>${p.timestamp}</td>
                <td>${p.pattern}</td>
            </tr>
        `).join('') : `<tr><td colspan="2">No recent patterns</td></tr>`;
    }

    // Update recent signals table
    function updateRecentSignalsTable(table, recentSignals) {
        if (!table) {
            console.error("Recent signals table not found");
            return;
        }
        table.innerHTML = recentSignals.length > 0 ? recentSignals.map(s => `
            <tr>
                <td>${s.timestamp}</td>
                <td>${s.signal}</td>
            </tr>
        `).join('') : `<tr><td colspan="2">No recent signals</td></tr>`;
    }

    // Calculate support/resistance
    function calculateSupportResistance(candles) {
        if (!candles || candles.length < 5) {
            console.warn("Insufficient data for support/resistance");
            return { support: 0, resistance: 0 };
        }
        const highs = candles.map(candle => parseFloat(candle[2])).filter(h => !isNaN(h));
        const lows = candles.map(candle => parseFloat(candle[3])).filter(l => !isNaN(l));
        const support = highs.length ? Math.min(...lows) : 0;
        const resistance = lows.length ? Math.max(...highs) : 0;
        return { support, resistance };
    }

    function updateSupportResistance(symbol, table, candles) {
        if (!table) {
            console.error(`${symbol} support/resistance table not found`);
            return;
        }
        const { support, resistance } = calculateSupportResistance(candles);
        table.innerHTML = `
            <tr><td>Support</td><td>${support && support > 0 ? support.toFixed(2) : 'N/A'}</td></tr>
            <tr><td>Resistance</td><td>${resistance && resistance > 0 ? resistance.toFixed(2) : 'N/A'}</td></tr>
        `;
    }

    // Calculate target/stoploss
    function calculateTargetStoploss(candles, signal, currentPrice, bbands, atr) {
        if (!bbands || !currentPrice) {
            console.warn("Invalid data for target/stoploss");
            return { target: currentPrice || 0, stoploss: currentPrice || 0 };
        }
        const { upper, lower } = bbands;
        const latestUpper = upper[upper.length - 1] || currentPrice;
        const latestLower = lower[lower.length - 1] || currentPrice;

        let target, stoploss;
        if (signal === 'Buy') {
            target = latestUpper + (atr || 0);
            stoploss = currentPrice - 1.5 * (atr || 0);
        } else if (signal === 'Sell') {
            target = latestLower - (atr || 0);
            stoploss = currentPrice + 1.5 * (atr || 0);
        } else {
            target = currentPrice;
            stoploss = currentPrice;
        }
        return { target, stoploss };
    }

    // Update signal table
    function updateSignalTable(table, signalBox, timestamp, signal, price, action, target, stoploss, pattern, recentPatterns, recentSignals, symbol, confidence) {
        if (!table || !signalBox) {
            console.error(`Signal table or box not found for ${symbol}`);
            return;
        }
        const patternText = pattern ? pattern.pattern : 'None';
        const recentPatternText = recentPatterns.length > 0 ? `Recent: ${recentPatterns.map(p => p.pattern).join(', ')}` : '';
        table.innerHTML = `
            <tr>
                <td>${timestamp || 'N/A'}</td>
                <td>${signal}</td>
                <td>${price ? price.toFixed(2) : 'N/A'}</td>
                <td>${target ? target.toFixed(2) : 'N/A'}</td>
                <td>${stoploss ? stoploss.toFixed(2) : 'N/A'}</td>
                <td>${patternText}${recentPatternText ? ` (${recentPatternText})` : ''}</td>
                <td>${action}</td>
                <td>${confidence >= 0 ? confidence.toFixed(0) + '%' : 'N/A'}</td>
            </tr>
        `;
        signalBox.classList.remove('buy', 'sell', 'hold', 'active');
        signalBox.classList.add(signal.toLowerCase());
        signalBox.textContent = `Signal: ${signal}`;

        if (signal === 'Buy' || signal === 'Sell') {
            const signalEntry = { timestamp, signal };
            const signalsTable = safeQuery(`#${symbol.toLowerCase()}-recent-signals-table tbody`);
            if (symbol === 'BTC') {
                btcRecentSignals.push(signalEntry);
                if (btcRecentSignals.length > 5) btcRecentSignals.shift();
                updateRecentSignalsTable(signalsTable, btcRecentSignals);
            } else if (symbol === 'XAU') {
                xauRecentSignals.push(signalEntry);
                if (xauRecentSignals.length > 5) xauRecentSignals.shift();
                updateRecentSignalsTable(signalsTable, xauRecentSignals);
            }
        }
    }

    // Cache data
    function cacheData(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (e) {
            console.warn("Failed to cache data:", e);
        }
    }

    function getCachedData(key) {
        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < 5 * 60 * 1000) return data;
            }
        } catch (e) {
            console.warn("Failed to retrieve cached data:", e);
        }
        return null;
    }

    // WebSocket for live data
    let btcWebSocket;
    function initWebSocket(symbol, interval, callback) {
        const wsUrl = `wss://stream.binance.com:9443/ws/btcusdt@kline_${interval}`;
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.k) {
                    callback({
                        open: parseFloat(data.k.o),
                        high: parseFloat(data.k.h),
                        low: parseFloat(data.k.l),
                        close: parseFloat(data.k.c),
                        volume: parseFloat(data.k.v),
                        timestamp: data.k.t,
                        isClosed: data.k.x
                    });
                }
            } catch (e) {
                console.error("WebSocket message error:", e);
            }
        };
        ws.onerror = (error) => {
            console.error(`${symbol} WebSocket error:`, error);
        };
        ws.onclose = () => {
            console.log(`${symbol} WebSocket closed, reconnecting...`);
            setTimeout(() => initWebSocket(symbol, interval, callback), 5000);
        };
        return ws;
    }

    function updatePatterns(symbol, table, candle, timeframe, isLive = false, pattern = null) {
        if (!table) {
            console.error(`${symbol} pattern table not found`);
            return;
        }
        const timestamp = new Date(candle.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        const label = isLive ? "Live" : "Previous";
        pattern = pattern || detectPattern([{ timestamp: candle.timestamp, 1: candle.open, 2: candle.high, 3: candle.low, 4: candle.close }], 0);
        table.innerHTML = pattern ? `
            <tr>
                <td>${timestamp}</td>
                <td>${pattern.pattern} (${label})</td>
                <td>${isLive ? '-' : pattern.confidence}</td>
                <td>${timeframe} min</td>
            </tr>
        ` : `<tr><td colspan="4">No ${label.toLowerCase()} pattern detected</td></tr>`;
    }

    // Fetch BTC data
    function fetchBTCSignals(interval = '5m') {
        const cacheKey = `btc_data_${interval}`;
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            updateBTCTables(cachedData, interval);
        }
        fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=50`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (!data || !Array.isArray(data) || data.length === 0) {
                    throw new Error("Invalid or empty BTC data");
                }
                cacheData(cacheKey, data);
                updateBTCTables(data, interval);
            })
            .catch(error => {
                console.error("Error fetching BTC data:", error);
                const btcSection = safeQuery("#btc-section");
                if (btcSection) {
                    const signalTable = safeQuery(".signal-table tbody", btcSection);
                    const recentSignalsTable = safeQuery(".recent-signals-table tbody", btcSection);
                    const patternTable = safeQuery(".pattern-table tbody", btcSection);
                    const recentPatternsTable = safeQuery(".recent-patterns-table tbody", btcSection);
                    const srTable = safeQuery(".sr-table tbody", btcSection);
                    if (signalTable) signalTable.innerHTML = `<tr><td colspan="8">Error: ${error.message}</td></tr>`;
                    if (recentSignalsTable) recentSignalsTable.innerHTML = `<tr><td colspan="2">Error loading signals</td></tr>`;
                    if (patternTable) patternTable.innerHTML = `<tr><td colspan="4">Error loading patterns</td></tr>`;
                    if (recentPatternsTable) recentPatternsTable.innerHTML = `<tr><td colspan="2">Error loading patterns</td></tr>`;
                    if (srTable) srTable.innerHTML = `<tr><td colspan="2">Error loading levels</td></tr>`;
                }
            });
    }

    function updateBTCTables(data, interval) {
        if (!data || !Array.isArray(data)) {
            console.error("Invalid BTC data");
            return;
        }
        const prices = data.map(candle => parseFloat(candle[4])).filter(p => !isNaN(p));
        const volumes = data.map(candle => parseFloat(candle[5])).filter(v => !isNaN(v));
        const latestCandle = {
            open: parseFloat(data[data.length - 1][1]),
            high: parseFloat(data[data.length - 1][2]),
            low: parseFloat(data[data.length - 1][3]),
            close: parseFloat(data[data.length - 1][4]),
            volume: parseFloat(data[data.length - 1][5]),
            timestamp: data[data.length - 1][0]
        };
        const timestamp = new Date(latestCandle.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        // Calculate indicators
        const rsi = calculateRSI(prices);
        const ema20 = calculateEMA(prices, 20);
        const ema50 = calculateEMA(prices, 50);
        const macd = calculateMACD(prices);
        const bbands = calculateBollingerBands(prices);
        const atr = calculateATR(data);

        // Volume check
        const avgVolume = volumes.length >= 20 ? volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20 : 0;
        const isHighVolume = latestCandle.volume > avgVolume * 1.5;

        // Signal logic
        let signal = "Hold", action = "Wait", confidence = 0;
        const indicators = [];

        if (rsi && rsi < 30) indicators.push('buy-rsi');
        else if (rsi && rsi > 70) indicators.push('sell-rsi');

        const latestEMA20 = ema20[ema20.length - 1];
        const latestEMA50 = ema50[ema50.length - 1];
        const prevEMA20 = ema20[ema20.length - 2];
        const prevEMA50 = ema50[ema50.length - 2];
        if (latestEMA20 && latestEMA50 && prevEMA20 && prevEMA50) {
            if (prevEMA20 <= prevEMA50 && latestEMA20 > latestEMA50) indicators.push('buy-ema');
            else if (prevEMA20 >= prevEMA50 && latestEMA20 < latestEMA50) indicators.push('sell-ema');
        }

        const latestMACD = macd.macd[macd.macd.length - 1];
        const latestSignal = macd.signal[macd.signal.length - 1];
        const prevMACD = macd.macd[macd.macd.length - 2];
        const prevSignal = macd.signal[macd.signal.length - 2];
        if (latestMACD && latestSignal && prevMACD && prevSignal) {
            if (prevMACD <= prevSignal && latestMACD > latestSignal) indicators.push('buy-macd');
            else if (prevMACD >= prevSignal && latestMACD < latestSignal) indicators.push('sell-macd');
        }

        const latestBBUpper = bbands.upper[bbands.upper.length - 1];
        const latestBBLower = bbands.lower[bbands.lower.length - 1];
        if (latestBBLower && latestCandle.close <= latestBBLower) indicators.push('buy-bbands');
        else if (latestBBUpper && latestCandle.close >= latestBBUpper) indicators.push('sell-bbands');

        if (isHighVolume) indicators.push('buy-volume', 'sell-volume');

        const buySignals = indicators.filter(i => i.startsWith('buy')).length;
        const sellSignals = indicators.filter(i => i.startsWith('sell')).length;
        if (buySignals >= 3) {
            signal = "Buy";
            action = "Enter";
            confidence = Math.min(buySignals * 20, 100);
        } else if (sellSignals >= 3) {
            signal = "Sell";
            action = "Exit";
            confidence = Math.min(sellSignals * 20, 100);
        }

        console.log("BTC Indicators:", indicators, "Signal:", signal, "Confidence:", confidence);

        // Target and Stoploss
        const { target, stoploss } = calculateTargetStoploss(data, signal, latestCandle.close, bbands, atr);

        // Pattern
        const pattern = detectPattern(data, data.length - 1);
        if (pattern) {
            btcRecentPatterns.push({
                timestamp: timestamp,
                pattern: pattern.pattern
            });
            if (btcRecentPatterns.length > 5) btcRecentPatterns.shift();
        }

        // Update signals
        const btcSignalTable = safeQuery("#btc-signal-table tbody");
        const btcSignalBox = safeQuery("#btc-section .signal-box");
        updateSignalTable(btcSignalTable, btcSignalBox, timestamp, signal, latestCandle.close, action, target, stoploss, pattern, btcRecentPatterns, btcRecentSignals, 'BTC', confidence);

        // Update support/resistance
        const btcSRTable = safeQuery("#btc-sr-table tbody");
        updateSupportResistance('BTC', btcSRTable, data);

        // Update patterns
        const btcPatternTable = safeQuery("#btc-pattern-table tbody");
        updatePatterns('BTC', btcPatternTable, latestCandle, interval.replace('m', ''), false, pattern);

        // Update recent patterns
        const btcRecentPatternsTable = safeQuery("#btc-recent-patterns-table tbody");
        updateRecentPatternsTable(btcRecentPatternsTable, btcRecentPatterns);
    }

    // Fetch XAU data
    function fetchXAUSignals(interval = '5min') {
        const cacheKey = `xau_data_${interval}`;
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            updateXAUTables(cachedData, interval);
        }
        fetch(`https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=XAU&to_symbol=USD&interval=${interval}&apikey=${alphaVantageKey}`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (!data[`Time Series FX (${interval})`]) {
                    throw new Error("Invalid XAU data or API limit reached");
                }
                const timeSeries = data[`Time Series FX (${interval})`];
                const timestamps = Object.keys(timeSeries).sort().slice(-50);
                const candles = timestamps.map(ts => [
                    ts,
                    timeSeries[ts]["1. open"],
                    timeSeries[ts]["2. high"],
                    timeSeries[ts]["3. low"],
                    timeSeries[ts]["4. close"]
                ]);
                cacheData(cacheKey, candles);
                updateXAUTables(candles, interval);
            })
            .catch(error => {
                console.error("Error fetching XAU data:", error);
                const xauSection = safeQuery("#xau-section");
                if (xauSection) {
                    const signalTable = safeQuery(".signal-table tbody", xauSection);
                    const recentSignalsTable = safeQuery(".recent-signals-table tbody", xauSection);
                    const patternTable = safeQuery(".pattern-table tbody", xauSection);
                    const recentPatternsTable = safeQuery(".recent-patterns-table tbody", xauSection);
                    const srTable = safeQuery(".sr-table tbody", xauSection);
                    if (signalTable) signalTable.innerHTML = `<tr><td colspan="8">Error: ${error.message}</td></tr>`;
                    if (recentSignalsTable) recentSignalsTable.innerHTML = `<tr><td colspan="2">Error loading signals</td></tr>`;
                    if (patternTable) patternTable.innerHTML = `<tr><td colspan="4">Error loading patterns</td></tr>`;
                    if (recentPatternsTable) recentPatternsTable.innerHTML = `<tr><td colspan="2">Error loading patterns</td></tr>`;
                    if (srTable) srTable.innerHTML = `<tr><td colspan="2">Error loading levels</td></tr>`;
                }
            });
    }

    function updateXAUTables(candles, interval) {
        if (!candles || !Array.isArray(candles)) {
            console.error("Invalid XAU data");
            return;
        }
        const prices = candles.map(candle => parseFloat(candle[4])).filter(p => !isNaN(p));
        const latestTimestamp = candles[candles.length - 1][0];
        const latestCandle = {
            open: parseFloat(candles[candles.length - 1][1]),
            high: parseFloat(candles[candles.length - 1][2]),
            low: parseFloat(candles[candles.length - 1][3]),
            close: parseFloat(candles[candles.length - 1][4]),
            timestamp: new Date(latestTimestamp).getTime()
        };
        const timestamp = new Date(latestTimestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        // Calculate indicators
        const rsi = calculateRSI(prices);
        const ema20 = calculateEMA(prices, 20);
        const ema50 = calculateEMA(prices, 50);
        const macd = calculateMACD(prices);
        const bbands = calculateBollingerBands(prices);
        const atr = calculateATR(candles);

        // Signal logic (no volume for XAU)
        let signal = "Hold", action = "Wait", confidence = 0;
        const indicators = [];

        if (rsi && rsi < 30) indicators.push('buy-rsi');
        else if (rsi && rsi > 70) indicators.push('sell-rsi');

        const latestEMA20 = ema20[ema20.length - 1];
        const latestEMA50 = ema50[ema50.length - 1];
        const prevEMA20 = ema20[ema20.length - 2];
        const prevEMA50 = ema50[ema50.length - 2];
        if (latestEMA20 && latestEMA50 && prevEMA20 && prevEMA50) {
            if (prevEMA20 <= prevEMA50 && latestEMA20 > latestEMA50) indicators.push('buy-ema');
            else if (prevEMA20 >= prevEMA50 && latestEMA20 < latestEMA50) indicators.push('sell-ema');
        }

        const latestMACD = macd.macd[macd.macd.length - 1];
        const latestSignal = macd.signal[macd.signal.length - 1];
        const prevMACD = macd.macd[macd.macd.length - 2];
        const prevSignal = macd.signal[macd.signal.length - 2];
        if (latestMACD && latestSignal && prevMACD && prevSignal) {
            if (prevMACD <= prevSignal && latestMACD > latestSignal) indicators.push('buy-macd');
            else if (prevMACD >= prevSignal && latestMACD < latestSignal) indicators.push('sell-macd');
        }

        const latestBBUpper = bbands.upper[bbands.upper.length - 1];
        const latestBBLower = bbands.lower[bbands.lower.length - 1];
        if (latestBBLower && latestCandle.close <= latestBBLower) indicators.push('buy-bbands');
        else if (latestBBUpper && latestCandle.close >= latestBBUpper) indicators.push('sell-bbands');

        const buySignals = indicators.filter(i => i.startsWith('buy')).length;
        const sellSignals = indicators.filter(i => i.startsWith('sell')).length;
        if (buySignals >= 3) {
            signal = "Buy";
            action = "Enter";
            confidence = Math.min(buySignals * 25, 100);
        } else if (sellSignals >= 3) {
            signal = "Sell";
            action = "Exit";
            confidence = Math.min(sellSignals * 25, 100);
        }

        console.log("XAU Indicators:", indicators, "Signal:", signal, "Confidence:", confidence);

        // Target and Stoploss
        const { target, stoploss } = calculateTargetStoploss(candles, signal, latestCandle.close, bbands, atr);

        // Pattern
        const pattern = detectPattern(candles, candles.length - 1);
        if (pattern) {
            xauRecentPatterns.push({
                timestamp: timestamp,
                pattern: pattern.pattern
            });
            if (xauRecentPatterns.length > 5) xauRecentPatterns.shift();
        }

        // Update signals
        const xauSignalTable = safeQuery("#xau-signal-table tbody");
        const xauSignalBox = safeQuery("#xau-section .signal-box");
        updateSignalTable(xauSignalTable, xauSignalBox, timestamp, signal, latestCandle.close, action, target, stoploss, pattern, xauRecentPatterns, xauRecentSignals, 'XAU', confidence);

        // Update support/resistance
        const xauSRTable = safeQuery("#xau-sr-table tbody");
        updateSupportResistance('XAU', xauSRTable, candles);

        // Update patterns
        const xauPatternTable = safeQuery("#xau-pattern-table tbody");
        updatePatterns('XAU', xauPatternTable, latestCandle, interval.replace('min', ''), false, pattern);

        // Update recent patterns
        const xauRecentPatternsTable = safeQuery("#xau-recent-patterns-table tbody");
        updateRecentPatternsTable(xauRecentPatternsTable, xauRecentPatterns);
    }

    // Handle timeframe changes
    const btcTimeframe = safeQuery("#btc-timeframe");
    if (btcTimeframe) {
        btcTimeframe.addEventListener('change', (e) => {
            const interval = e.target.value === '1' ? '1m' : e.target.value === '5' ? '5m' : '15m';
            fetchBTCSignals(interval);
            if (btcWebSocket) btcWebSocket.close();
            btcWebSocket = initWebSocket('BTC', interval, (candle) => {
                if (!candle.isClosed) {
                    const btcPatternTable = safeQuery("#btc-pattern-table tbody");
                    if (btcPatternTable) {
                        updatePatterns('BTC', btcPatternTable, candle, e.target.value, true);
                    }
                }
            });
        });
    } else {
        console.error("BTC timeframe selector not found");
    }

    const xauTimeframe = safeQuery("#xau-timeframe");
    if (xauTimeframe) {
        xauTimeframe.addEventListener('change', (e) => {
            const interval = e.target.value === '1' ? '1min' : e.target.value === '5' ? '5min' : '15min';
            fetchXAUSignals(interval);
        });
    } else {
        console.error("XAU timeframe selector not found");
    }

    // Initial fetch
    fetchBTCSignals();
    fetchXAUSignals();
    setInterval(() => fetchBTCSignals(), 60 * 1000);
    setInterval(() => fetchXAUSignals(), 60 * 1000);

    // Initialize WebSocket
    btcWebSocket = initWebSocket('BTC', '5m', (candle) => {
        if (!candle.isClosed) {
            const btcPatternTable = safeQuery("#btc-pattern-table tbody");
            if (btcPatternTable) {
                updatePatterns('BTC', btcPatternTable, candle, '5', true);
            }
        }
    });

    // Fetch XAU news
    const xauNewsFeed = safeQuery("#xau-news-feed");
    if (xauNewsFeed) {
        fetch(`https://newsapi.org/v2/everything?q=gold%20price%20OR%20gold%20trading%20OR%20gold%20India&language=en&sortBy=publishedAt&apiKey=${newsApiKey}`)
            .then(response => response.json())
            .then(data => {
                xauNewsFeed.innerHTML = "";
                const articles = data.articles ? data.articles.slice(0, 5) : [];
                if (articles.length === 0) {
                    xauNewsFeed.textContent = "No XAU news found.";
                    return;
                }
                articles.forEach(article => {
                    const newsItem = document.createElement("div");
                    newsItem.className = "news-article";
                    newsItem.innerHTML = `
                        <a href="${article.url}" target="_blank">${article.title || "No title"}</a>
                        <p>${article.description || "No description available."}</p>
                        <p><small>${new Date(article.publishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</small></p>
                    `;
                    xauNewsFeed.appendChild(newsItem);
                });
            })
            .catch(error => {
                console.error("Error fetching XAU news:", error);
                if (xauNewsFeed) xauNewsFeed.textContent = "Failed to load XAU news.";
            });
    } else {
        console.error("XAU news feed element not found");
    }
});