import express from 'express'

const router = express.Router()

// MetaAPI credentials
const META_API_TOKEN = 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiJiYmRlZGVjYWJjMDAzOTczNTQ3ODk2Y2NlYjgyNzY2NSIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOjVmYTc1OGVjLWIyNDEtNGM5Ny04MWM0LTlkZTNhM2JjMWYwNCJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6NWZhNzU4ZWMtYjI0MS00Yzk3LTgxYzQtOWRlM2EzYmMxZjA0Il19LHsiaWQiOiJtZXRhYXBpLXJwYy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo1ZmE3NThlYy1iMjQxLTRjOTctODFjNC05ZGUzYTNiYzFmMDQiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo1ZmE3NThlYy1iMjQxLTRjOTctODFjNC05ZGUzYTNiYzFmMDQiXX0seyJpZCI6Im1ldGFzdGF0cy1hcGkiLCJtZXRob2RzIjpbIm1ldGFzdGF0cy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6NWZhNzU4ZWMtYjI0MS00Yzk3LTgxYzQtOWRlM2EzYmMxZjA0Il19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOjVmYTc1OGVjLWIyNDEtNGM5Ny04MWM0LTlkZTNhM2JjMWYwNCJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiYmJkZWRlY2FiYzAwMzk3MzU0Nzg5NmNjZWI4Mjc2NjUiLCJpYXQiOjE3NjgyMTgwNzEsImV4cCI6MTc3NTk5NDA3MX0.aVtRIUtO-0gl409_F32jCfGzrIgMmg8qktJhD-54dCVn_8sVzrILGL0_m4suMWbcaR2L4zTFvDTZUP8fthGm0zGCGCE8Ub7ITR_PE5xIF0g7ShaBwN5UeUBa5LWYRzidmUI76ebwP_lUoRFttEws1uh7LgyS_eCajuVW0rb7KxshyM6D2wK9Gh_Eov9TLe1KOZEwSlNK5IORrovmVEic1c6BAkLGwiloDUsvei1H27xj1ab-u80xBrkqckFzJ_09K7iRZVyH941ujySmFjsn-ptBBcjWw3vYBU-4GhBsmHEUImV-sUNInwOltsv3zjtFDa8_0FjpNbpgyPBCTRV6KsPLsAUYbELMnKy8cIgxSCnO1_7nzCWYdJ1dSa2fcpsGapzK4l04UEx7_qiaN6FJ0gi3GSSaFrZIbGuUGZTWeFCWiLQ8jayYqFsnqHz5vK32TqSgi4JpUhaWDDRcneUc4lzv_vVzLQ3wuPKC0TKnPLPVg0pgQS9tThPMhdkEQk8M3FZmiW-8VCCynGOmgM2Xquca3o3iGh6HXiJr3DHzq-1W050kf7Hl_2G7C-heOHFkOBKtB6h3q-ca8znHvq3LC5sRWf7cVjd8HaMMmG-iqxw4p4UkkZQFRC5sTWJSDEdPU_3WgsUDbJz1GdAsP1oOTtHwgQwEnxby9btczWjUBeA'
const META_API_ACCOUNT_ID = '5fa758ec-b241-4c97-81c4-9de3a3bc1f04'

// Binance symbol mapping for crypto
const BINANCE_SYMBOLS = {
  'BTCUSD': 'BTCUSDT',
  'ETHUSD': 'ETHUSDT',
  'BNBUSD': 'BNBUSDT',
  'SOLUSD': 'SOLUSDT',
  'XRPUSD': 'XRPUSDT',
  'ADAUSD': 'ADAUSDT',
  'DOGEUSD': 'DOGEUSDT',
  'DOTUSD': 'DOTUSDT',
  'MATICUSD': 'MATICUSDT',
  'LTCUSD': 'LTCUSDT',
  'AVAXUSD': 'AVAXUSDT',
  'LINKUSD': 'LINKUSDT'
}

// MetaAPI symbols (forex + metals)
const METAAPI_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD', 'EURGBP', 'EURJPY', 'GBPJPY', 'XAUUSD', 'XAGUSD']

// Fetch price from MetaAPI (forex/metals)
async function getMetaApiPrice(symbol) {
  try {
    const response = await fetch(
      `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${META_API_ACCOUNT_ID}/symbols/${symbol}/current-price`,
      {
        headers: {
          'auth-token': META_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    )
    if (!response.ok) {
      console.error(`MetaAPI error for ${symbol}: ${response.status}`)
      return null
    }
    const data = await response.json()
    if (data.bid) {
      return { bid: data.bid, ask: data.ask || data.bid }
    }
    return null
  } catch (e) {
    console.error(`MetaAPI error for ${symbol}:`, e.message)
    return null
  }
}

// Fetch price from Binance (crypto)
async function getBinancePrice(symbol) {
  const binanceSymbol = BINANCE_SYMBOLS[symbol]
  if (!binanceSymbol) return null
  
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${binanceSymbol}`)
    if (!response.ok) return null
    const data = await response.json()
    return {
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice)
    }
  } catch (e) {
    console.error(`Binance error for ${symbol}:`, e.message)
    return null
  }
}

// GET /api/prices/:symbol - Get single symbol price
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params
    let price = null
    
    // Use MetaAPI for forex/metals
    if (METAAPI_SYMBOLS.includes(symbol)) {
      price = await getMetaApiPrice(symbol)
    }
    // Use Binance for crypto
    else if (BINANCE_SYMBOLS[symbol]) {
      price = await getBinancePrice(symbol)
    }
    
    if (price) {
      res.json({ success: true, price })
    } else {
      res.status(404).json({ success: false, message: 'Price not available' })
    }
  } catch (error) {
    console.error('Error fetching price:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// Global price cache with background refresh
const priceCache = new Map()
const CACHE_TTL = 30000 // 30 second cache to avoid rate limits

// Background price streaming
let streamingInterval = null
let isRefreshing = false

async function refreshAllPrices() {
  if (isRefreshing) return // Prevent overlapping refreshes
  isRefreshing = true
  const now = Date.now()
  
  // Refresh Binance prices (single call for all crypto)
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/bookTicker')
    if (response.ok) {
      const allTickers = await response.json()
      const tickerMap = {}
      allTickers.forEach(t => { tickerMap[t.symbol] = t })
      
      Object.keys(BINANCE_SYMBOLS).forEach(symbol => {
        const binanceSymbol = BINANCE_SYMBOLS[symbol]
        const ticker = tickerMap[binanceSymbol]
        if (ticker) {
          priceCache.set(symbol, {
            price: { bid: parseFloat(ticker.bidPrice), ask: parseFloat(ticker.askPrice) },
            time: now
          })
        }
      })
    }
  } catch (e) {
    console.error('Binance refresh error:', e.message)
  }
  
  // Refresh MetaAPI prices (sequential with 1s delay to avoid rate limit)
  for (const symbol of METAAPI_SYMBOLS) {
    try {
      const price = await getMetaApiPrice(symbol)
      if (price) {
        priceCache.set(symbol, { price, time: now })
      }
    } catch (e) {
      // Silent fail
    }
    // 1 second delay between requests (max 1 req/sec for MetaAPI)
    await new Promise(r => setTimeout(r, 1000))
  }
  
  isRefreshing = false
  console.log('Prices refreshed:', priceCache.size, 'symbols')
}

// Start background streaming - disabled to avoid rate limits
// Prices are fetched on-demand instead
function startPriceStreaming() {
  console.log('Price streaming disabled - using on-demand fetching')
}

// Don't auto-start streaming
// startPriceStreaming()

// POST /api/prices/batch - Get multiple symbol prices
router.post('/batch', async (req, res) => {
  try {
    const { symbols } = req.body
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, message: 'symbols array required' })
    }
    
    const prices = {}
    const now = Date.now()
    
    // Get prices from cache first
    const missingSymbols = []
    for (const symbol of symbols) {
      const cached = priceCache.get(symbol)
      if (cached && (now - cached.time) < 5000) {
        prices[symbol] = cached.price
      } else {
        missingSymbols.push(symbol)
      }
    }
    
    // Fetch missing prices in parallel
    if (missingSymbols.length > 0) {
      // Fetch Binance prices (single batch call)
      const binanceMissing = missingSymbols.filter(s => BINANCE_SYMBOLS[s])
      if (binanceMissing.length > 0) {
        try {
          const response = await fetch('https://api.binance.com/api/v3/ticker/bookTicker')
          if (response.ok) {
            const allTickers = await response.json()
            const tickerMap = {}
            allTickers.forEach(t => { tickerMap[t.symbol] = t })
            
            binanceMissing.forEach(symbol => {
              const binanceSymbol = BINANCE_SYMBOLS[symbol]
              const ticker = tickerMap[binanceSymbol]
              if (ticker) {
                const price = { bid: parseFloat(ticker.bidPrice), ask: parseFloat(ticker.askPrice) }
                prices[symbol] = price
                priceCache.set(symbol, { price, time: now })
              }
            })
          }
        } catch (e) {
          console.error('Binance batch error:', e.message)
        }
      }
      
      // Fetch MetaAPI prices in parallel (max 3 concurrent)
      const metaApiMissing = missingSymbols.filter(s => METAAPI_SYMBOLS.includes(s))
      if (metaApiMissing.length > 0) {
        const metaPromises = metaApiMissing.map(async (symbol) => {
          const price = await getMetaApiPrice(symbol)
          if (price) {
            prices[symbol] = price
            priceCache.set(symbol, { price, time: now })
          }
        })
        await Promise.allSettled(metaPromises)
      }
    }
    
    res.json({ success: true, prices })
  } catch (error) {
    console.error('Error fetching batch prices:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
