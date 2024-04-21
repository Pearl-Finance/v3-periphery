module.exports = {
  skipFiles: ['libraries', 'examples', 'base', 'mock', 'test', 'interfaces', 'V3Migrator.sol'],
  // istanbulReporter: ['lcov'],
  configureYulOptimizer: true,
  solcOptimizerDetails: {
    peephole: false,
    jumpdestRemover: false,
    orderLiterals: true, // <-- TRUE! Stack too deep when false https://github.com/sc-forks/solidity-coverage/blob/f550eaeed9c05922bdb059030d86c27a0c22c142/docs/faq.md#running-out-of-stack
    deduplicate: false,
    cse: false,
    constantOptimizer: false,
    yul: true,
  },
}
