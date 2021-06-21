require("dotenv").config();
const Web3 = require("web3");
const fetch = require("node-fetch");
const providerLink =
  "https://mainnet.infura.io/v3/5fc4a237507c477cab9666203f3847a4";
const web3 = new Web3(new Web3(providerLink));
const provider = new Web3.providers.HttpProvider(providerLink);
const Contract = require("web3-eth-contract");
Contract.setProvider(provider);

const apikey = process.env.API_KEY; // to access etherscan API
const contract = process.env.CONTRACT; // contract address
const uniswapRouterAccount = process.env.UNISWAP_ADDRESS; // the address of the pool
const account = process.env.ACCOUNT;

async function main() {
  const { providedUSD, ethUsd, providedETH } = await getTokenData();

  let currentValueInUSD = await getDataAboutThePool();

  const couldBeTheValue = providedETH * ethUsd + providedUSD;

  let impermanent_loss = (couldBeTheValue - currentValueInUSD).toFixed(4);

  let impermanent_loss_percent = (couldBeTheValue / currentValueInUSD).toFixed(
    4
  );

  console.log(
    `The impermanent loss is:\x1b[32m ${impermanent_loss}\x1b[37m USD, and \x1b[32m${impermanent_loss_percent}%\x1b[37m`
  );
}

main();

//Helper functions

//
async function getDecimal(contract, address) {
  let contractDecimal = await contract.methods
    .decimals()
    .call({ from: address });
  return Number(`1e${contractDecimal}`);
}

//
async function getDataAboutThePool() {
  const ABI = await fetch(
    `https://api.etherscan.io/api?module=contract&action=getabi&address=${contract}&apikey=${apikey}`
  )
    .then((res) => res.json())
    .then((body) => {
      if (body.status === "1") {
        const res = JSON.parse(body.result);
        return res;
      }
    });
  let uniswapLPContract = new Contract(ABI, contract);
  if (uniswapLPContract) {
    let totalSupply = await uniswapLPContract.methods
      .totalSupply()
      .call({ from: account });

    let contractDecimal = await getDecimal(uniswapLPContract, account);

    totalSupply = totalSupply / contractDecimal;

    // the uniswap token balance of the account
    const lpBalance =
      Number(
        await uniswapLPContract.methods
          .balanceOf(account)
          .call({ from: account })
      ) / contractDecimal;

    // the amount of each token in the pool
    let reserves = await uniswapLPContract.methods
      .getReserves()
      .call({ from: account });

    const token0 = await uniswapLPContract.methods[`token0`]().call({
      from: account,
    });
    const token0Contract = new Contract(ABI, token0);
    let token0Decimal = await getDecimal(token0Contract, account);

    const token1 = await uniswapLPContract.methods[`token1`]().call({
      from: account,
    });
    const token1Contract = new Contract(ABI, token1);
    let token1Decimal = await getDecimal(token1Contract, account);

    reserves = {
      token0: reserves[0] / token0Decimal,
      token1: reserves[1] / token1Decimal,
    };

    // the price of UNISWAP token
    const token1PriceInUSD = reserves.token0 / reserves.token1;

    let pricePerUnit =
      (reserves.token1 * token1PriceInUSD + reserves.token0) / totalSupply;

    // how much his part in the pool worth
    return lpBalance * pricePerUnit;
  }
}

// All the API's used to fetch data about the tokens
async function getTokenData() {
  //Eth price in USD
  const ethUsd = await fetch(
    `https://api.etherscan.io/api?module=stats&action=ethprice&apikey=${apikey}`
  )
    .then((res) => res.json())
    .then((body) => {
      return body.result.ethusd;
    });

  //Finding how much USD was sent to the pool
  const providedUSD = await fetch(
    `https://api.etherscan.io/api?module=account&action=tokentx&address=${account}&startblock=0&endblock=999999999&sort=asc&apikey=${apikey}`
  )
    .then((res) => res.json())
    .then((body) => {
      const { result } = body;
      let transactions = result.slice();
      let providedUSDTxn = transactions.find(
        (transaction) => transaction.from === account.toLowerCase()
      );
      const providedUsd =
        providedUSDTxn.value / Math.pow(10, providedUSDTxn.tokenDecimal);
      return providedUsd;
    });

  //Finding how much eth was sent to the pool
  const providedETH = await fetch(
    `https://api.etherscan.io/api?module=account&action=txlist&address=${account}&startblock=0&endblock=99999999&sort=asc&apikey=${apikey}`
  )
    .then((res) => res.json())
    .then((body) => {
      let transactions = body.result;
      transactions = transactions?.filter((transaction) => {
        if (transaction.to === uniswapRouterAccount) {
          return true;
        }
        return false;
      });

      let transactionValues = transactions?.map((transaction) => {
        return web3.utils.fromWei(transaction.value, "ether");
      });

      transactionValues = transactionValues?.reduce(
        (accumulator, currentValue) => accumulator + currentValue
      );

      return transactionValues;
    });

  return { providedUSD, ethUsd, providedETH };
}
