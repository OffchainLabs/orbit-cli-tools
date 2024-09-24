import { OrbitChainInformation } from '../src/types';
import { getChain, GetChainOptions } from '../src/getChain';
import yargs from 'yargs/yargs';

//////////////////////
// Helper functions //
//////////////////////
const renderChainInformation = (chainInformation: OrbitChainInformation) => {
  console.log('*********************');
  console.log('* Chain information *');
  console.log('*********************');
  console.log(chainInformation);
};

///////////////////
// Main function //
///////////////////
const main = async (options: GetChainOptions) => {
  const orbitChainInformation = await getChain({
    ...options,
    verbose: true
  });
  if (orbitChainInformation) {
    renderChainInformation(orbitChainInformation);
  }
};

/////////////////////
// Start execution //
/////////////////////
const options = yargs(process.argv.slice(2))
  .options({
    id: { type: 'number' },
    rpc: { type: 'string' },
    rollup: { type: 'string' },
  })
  .check((argv) => {
    if (!argv.rollup && !argv.id && !argv.rpc) {
      throw new Error('At least one option needs to be specified');
    }

    return true;
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
