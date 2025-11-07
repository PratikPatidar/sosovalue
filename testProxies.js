const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Configuration
const PROXY_FILE = path.join(__dirname, '..', 'proxyGenerator', 'working_proxies.txt');
const TEST_URL = 'https://api.ipify.org?format=json';
const TIMEOUT = 10000; // 10 seconds
const CONCURRENCY = 10; // Number of concurrent tests

// Read proxies from file
function loadProxies() {
    try {
        const content = fs.readFileSync(PROXY_FILE, 'utf-8');
        return content
            .split('\n')
            .map(p => p.trim())
            .filter(Boolean);
    } catch (error) {
        console.error(`Error reading proxy file: ${error.message}`);
        process.exit(1);
    }
}

// Create proxy agent based on proxy type
function createProxyAgent(proxyUrl) {
    try {
        if (proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
            return new SocksProxyAgent(proxyUrl, { timeout: TIMEOUT });
        } else if (proxyUrl.startsWith('http')) {
            return new HttpsProxyAgent(proxyUrl, { timeout: TIMEOUT });
        }
    } catch (error) {
        console.error(`Error creating agent for ${proxyUrl}: ${error.message}`);
    }
    return null;
}

// Test a single proxy
async function testProxy(proxy) {
    const startTime = Date.now();
    const agent = createProxyAgent(proxy);
    
    if (!agent) {
        return { proxy, status: 'invalid', error: 'Invalid proxy format', time: 0 };
    }

    try {
        const response = await axios.get(TEST_URL, {
            httpsAgent: agent,
            timeout: TIMEOUT
        });
        
        const responseTime = Date.now() - startTime;
        
        if (response.status === 200 && response.data && response.data.ip) {
            return {
                proxy,
                status: 'working',
                ip: response.data.ip,
                time: responseTime
            };
        } else {
            return {
                proxy,
                status: 'error',
                error: `Unexpected response: ${response.status}`,
                time: responseTime
            };
        }
    } catch (error) {
        return {
            proxy,
            status: 'error',
            error: error.message,
            time: Date.now() - startTime
        };
    }
}

// Process proxies in batches
async function testProxies() {
    const proxies = loadProxies();
    console.log(`Testing ${proxies.length} proxies...\n`);
    
    const results = {
        working: [],
        error: [],
        invalid: []
    };
    
    // Process proxies in batches
    for (let i = 0; i < proxies.length; i += CONCURRENCY) {
        const batch = proxies.slice(i, i + CONCURRENCY);
        const batchPromises = batch.map(proxy => testProxy(proxy));
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process results
        batchResults.forEach(result => {
            results[result.status].push(result);
            
            const statusColor = result.status === 'working' ? '\x1b[32m' : '\x1b[31m';
            const statusText = result.status.toUpperCase();
            const timeInfo = result.time ? `(${result.time}ms)` : '';
            const ipInfo = result.ip ? `[${result.ip}]` : '';
            const errorInfo = result.error ? `- ${result.error}` : '';
            
            console.log(`${statusColor}${statusText.padEnd(8)}\x1b[0m ${result.proxy.padEnd(40)} ${ipInfo} ${timeInfo} ${errorInfo}`.trim());
        });
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Print summary
    console.log('\n=== Test Summary ===');
    console.log(`Total proxies: ${proxies.length}`);
    console.log(`Working: ${results.working.length}`);
    console.log(`Errors: ${results.error.length}`);
    console.log(`Invalid: ${results.invalid.length}`);
    
    // Save working proxies
    if (results.working.length > 0) {
        const workingProxies = results.working.map(r => r.proxy).join('\n');
        const outputFile = path.join(__dirname, '..', 'proxyGenerator', 'verified_proxies.txt');
        fs.writeFileSync(outputFile, workingProxies);
        console.log(`\n✅ Verified proxies saved to: ${outputFile}`);
    }
}

// Run the test
testProxies().catch(console.error);
