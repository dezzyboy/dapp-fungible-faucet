// @ts-check

import fs from 'fs';
import '@agoric/zoe/exported.js';
import { E } from '@endo/eventual-send';
import bundleSource from '@endo/bundle-source';

import { pursePetnames } from './petnames.js';

// This script takes our contract code, installs it on Zoe, and makes
// the installation publicly available. Our backend API script will
// use this installation in a later step.

/**
 * @template T
 * @typedef {import('@endo/eventual-send').ERef<T>} ERef
 */

/**
 * @typedef {Object} DeployPowers The special powers that agoric deploy gives us
 * @property {(path: string) => string} pathResolve
 *
 * @typedef {Object} Board
 * @property {(id: string) => any} getValue
 * @property {(value: any) => string} getId
 * @property {(value: any) => boolean} has
 * @property {() => [string]} ids
 */

/**
 * @param {(path: string) => string} pathResolve
 * @param {ERef<ZoeService>} zoe
 * @param {ERef<Board>} board
 * @returns {Promise<{ CONTRACT_NAME: string, INSTALLATION_BOARD_ID: string }>}
 */
const installBundle = async (pathResolve, zoe, board) => {
  // We must bundle up our contract code (./src/contract.js)
  // and install it on Zoe. This returns an installationHandle, an
  // opaque, unforgeable identifier for our contract code that we can
  // reuse again and again to create new, live contract instances.
  const bundle = await bundleSource(pathResolve(`./src/contract.js`));
  const installation = await E(zoe).install(bundle);

  // Let's share this installation with other people, so that
  // they can run our contract code by making a contract
  // instance (see the api deploy script in this repo to see an
  // example of how to use the installation to make a new contract
  // instance.)
  // To share the installation, we're going to put it in the
  // board. The board is a shared, on-chain object that maps
  // strings to objects.
  const CONTRACT_NAME = 'fungibleFaucet';
  const INSTALLATION_BOARD_ID = await E(board).getId(installation);
  console.log('- SUCCESS! contract code installed on Zoe');
  console.log(`-- Contract Name: ${CONTRACT_NAME}`);
  console.log(`-- Installation Board Id: ${INSTALLATION_BOARD_ID}`);
  return { CONTRACT_NAME, INSTALLATION_BOARD_ID };
};

/**
 * @param {ERef<Object>} wallet
 * @param {ERef<Object>} faucet
 */
const sendDeposit = async (wallet, faucet) => {
  // We must first fund our "feePurse", the purse that we will use to
  // pay for our interactions with Zoe.
  const RUNPurse = E(wallet).getPurse(pursePetnames.RUN);
  const runAmount = await E(RUNPurse).getCurrentAmount();
  const feePurse = E(faucet).getFeePurse();
  const feePayment = await E(E(wallet).getPurse(pursePetnames.RUN)).withdraw(
    runAmount,
  );
  await E(feePurse).deposit(feePayment);
};

/**
 * @param {Promise<{zoe: ERef<ZoeService>, board: ERef<Board>, agoricNames:
 * Object, wallet: ERef<Object>, faucet: ERef<Object>}>} homePromise
 * @param {DeployPowers} powers
 */
const deployContract = async (homePromise, { pathResolve }) => {
  // Your off-chain machine (what we call an ag-solo) starts off with
  // a number of references, some of which are shared objects on chain, and
  // some of which are objects that only exist on your machine.

  // Let's wait for the promise to resolve.
  const home = await homePromise;

  // Unpack the references.
  const {
    // *** ON-CHAIN REFERENCES ***

    // Zoe lives on-chain and is shared by everyone who has access to
    // the chain. In this demo, that's just you, but on our testnet,
    // everyone has access to the same Zoe.
    zoe,

    // The board is an on-chain object that is used to make private
    // on-chain objects public to everyone else on-chain. These
    // objects get assigned a unique string id. Given the id, other
    // people can access the object through the board. Ids and values
    // have a one-to-one bidirectional mapping. If a value is added a
    // second time, the original id is just returned.
    board,

    // The wallet holds and manages assets for the user.
    wallet,

    // The faucet provides an initial amount of RUN for the user to use.
    faucet,
  } = home;

  await sendDeposit(wallet, faucet);
  const { CONTRACT_NAME, INSTALLATION_BOARD_ID } = await installBundle(
    pathResolve,
    zoe,
    board,
  );

  // Save the constants somewhere where the UI and api can find it.
  const dappConstants = {
    CONTRACT_NAME,
    INSTALLATION_BOARD_ID,
  };
  const defaultsFolder = pathResolve(`../ui/public/conf`);
  const defaultsFile = pathResolve(
    `../ui/public/conf/installationConstants.js`,
  );
  console.log('writing', defaultsFile);
  const defaultsContents = `\
// GENERATED FROM ${pathResolve('./deploy.js')}
export default ${JSON.stringify(dappConstants, undefined, 2)};
`;
  await fs.promises.mkdir(defaultsFolder, { recursive: true });
  await fs.promises.writeFile(defaultsFile, defaultsContents);
};

export default deployContract;
