const Web3 = require('web3');

// Replace with your Infura/Alchemy/local node provider URL
const web3 = new Web3('YOUR_ETHEREUM_NODE_URL');

// Replace with the Uniswap V2 Factory contract address on the target network
const FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3E058fc37489121cac4';

// Replace with the ABI of the Uniswap V2 Factory contract
const factoryABI = require('./abis/IUniswapV2Factory.json'); // You'll need to save the ABI to a file

// Replace with the ABI of the Uniswap V2 Pair contract (includes getReserves())
const pairABI = require('./abis/IUniswapV2Pair.json'); // You'll need to save the ABI to a file

// Replace with the address of your trading wallet (to send transactions from)
const TRADING_WALLET_ADDRESS = 'YOUR_TRADING_WALLET_ADDRESS';

// Replace with the private key of your trading wallet (KEEP THIS SECRET!)
const TRADING_WALLET_PRIVATE_KEY = 'YOUR_TRADING_WALLET_PRIVATE_KEY';

// Threshold for considering a contract "new" (e.g., within the last X blocks)
const NEW_CONTRACT_BLOCK_THRESHOLD = 10;

// Threshold for minimum liquidity to consider trading (in Wei, adjust as needed)
const MIN_LIQUIDITY_THRESHOLD = web3.utils.toWei('0.1', 'ether'); // Example: 0.1 ETH equivalent

// Function to get the current block number
const getCurrentBlock = async () => {
    return await web3.eth.getBlockNumber();
};

// Function to get token symbols (optional, for better logging)
const getTokenSymbols = async (tokenAddress) => {
    try {
        const tokenContract = new web3.eth.Contract([
            { constant: true, inputs: [], name: 'symbol', outputs: [{ internalType: 'string', name: '', type: 'string' }], payable: false, stateMutability: 'view', type: 'function' }
        ], tokenAddress);
        const symbol = await tokenContract.methods.symbol().call();
        return symbol;
    } catch (error) {
        console.error("Error getting token symbol:", error);
        return 'UNKNOWN';
    }
};

// Function to get liquidity reserves of a pair
const getPairLiquidity = async (pairAddress) => {
    try {
        const pairContract = new web3.eth.Contract(pairABI, pairAddress);
        const reserves = await pairContract.methods.getReserves().call();
        return {
            token0Reserve: reserves[0],
            token1Reserve: reserves[1],
            blockTimestampLast: reserves[2],
        };
    } catch (error) {
        console.error("Error getting pair reserves:", error);
        return null;
    }
};

// Function to simulate a buy transaction (replace with your actual trading logic)
const executeBuyTrade = async (pairAddress, token0Address, token1Address, amountETH) => {
    // This is a simplified example - you'll need to adapt it to your specific DEX and trade parameters
    console.log(`Simulating BUY on pair: ${pairAddress}, buying with ${web3.utils.fromWei(amountETH, 'ether')} ETH`);

    // **IMPORTANT:** This is where you would integrate with a DEX router contract
    // (e.g., Uniswap Router) to execute the actual trade. You'll need the Router's
    // address and ABI, and you'll need to construct the appropriate transaction data.

    // Example using web3.eth.sendTransaction (very basic, might not work directly on DEXs)
    const tx = {
        from: TRADING_WALLET_ADDRESS,
        to: pairAddress, // Or the DEX Router address
        gas: 200000, // Adjust gas limit as needed
        value: amountETH,
        data: '0x...', // Replace with your trade function's encoded data
    };

    try {
        const signedTx = await web3.eth.accounts.signTransaction(tx, TRADING_WALLET_PRIVATE_KEY);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log('Buy transaction receipt:', receipt);
    } catch (error) {
        console.error('Error executing buy trade:', error);
    }
};

const monitorNewContracts = async () => {
    const factoryContract = new web3.eth.Contract(factoryABI, FACTORY_ADDRESS);

    factoryContract.events.PairCreated({
        // Optionally filter for specific tokens if needed
    })
    .on('data', async (event) => {
        const token0Address = event.returnValues.token0;
        const token1Address = event.returnValues.token1;
        const pairAddress = event.returnValues.pair;

        const currentBlock = await getCurrentBlock();
        const creationBlock = event.blockNumber;

        if (currentBlock - creationBlock <= NEW_CONTRACT_BLOCK_THRESHOLD) {
            console.log(`\n🎉 New Pair Created!`);
            const symbol0 = await getTokenSymbols(token0Address);
            const symbol1 = await getTokenSymbols(token1Address);
            console.log(`Pair Address: ${pairAddress}`);
            console.log(`Token 0: ${token0Address} (${symbol0})`);
            console.log(`Token 1: ${token1Address} (${symbol1})`);
            console.log(`Creation Block: ${creationBlock}`);

            // Simulate "parsing the mempool" by listening for pending transactions involving the new pair or its tokens
            const subscription = web3.eth.subscribe('pendingTransactions')
            .on('data', async (txHash) => {
                try {
                    const transaction = await web3.eth.getTransaction(txHash);
                    if (transaction && (
                        transaction.to === pairAddress ||
                        transaction.from === pairAddress ||
                        transaction.to === token0Address ||
                        transaction.from === token0Address ||
                        transaction.to === token1Address ||
                        transaction.from === token1Address
                    )) {
                        console.log(`💰 Potential Mempool Activity for new pair (${pairAddress}): ${txHash}`);
                        // You can further analyze the transaction data here if needed
                    }
                } catch (error) {
                    console.error("Error fetching transaction:", error);
                }
            });

            // Get initial liquidity
            const liquidity = await getPairLiquidity(pairAddress);
            if (liquidity) {
                const ethReserve = web3.utils.fromWei(liquidity.token0Reserve, 'ether'); // Assuming one of the tokens is WETH
                const tokenReserve = web3.utils.fromWei(liquidity.token1Reserve, 'ether');
                console.log(`Initial Liquidity:`);
                console.log(`  Token 0 Reserve: ${ethReserve}`);
                console.log(`  Token 1 Reserve: ${tokenReserve}`);

                // Basic trading logic example: Buy if liquidity is above a threshold
                if (web3.utils.toBN(liquidity.token0Reserve).gte(web3.utils.toBN(MIN_LIQUIDITY_THRESHOLD))) {
                    const amountToBuy = web3.utils.toWei('0.01', 'ether'); // Example buy amount
                    await executeBuyTrade(pairAddress, token0Address, token1Address, amountToBuy);
                } else {
                    console.log("Liquidity below threshold, not trading.");
                }
            }

            // Unsubscribe from pending transactions after a short period (adjust as needed)
            setTimeout(() => {
                subscription.unsubscribe((err, success) => {
                    if (success) console.log('✅ Successfully unsubscribed from pending transactions.');
                });
            }, 30000); // Unsubscribe after 30 seconds
        }
    })
    .on('error', (error) => {
        console.error("Error on PairCreated event:", error);
    });

    console.log("🚀 Monitoring for new Uniswap pairs...");
};

// Run the monitor
monitorNewContracts();