/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/obsidian_mpc.json`.
 */
export type ObsidianMpc = {
  "address": "9Ywdn11qyk6eJz1XJSyPLWkiTFxpdqAxbcftS2PgvTpM",
  "metadata": {
    "name": "obsidianMpc",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Obsidian Relay MPC Integration - Blind Batch Execution"
  },
  "instructions": [
    {
      "name": "closeBatch",
      "docs": [
        "Close the batch and record the revealed total from MPC."
      ],
      "discriminator": [
        166,
        174,
        35,
        253,
        209,
        211,
        181,
        28
      ],
      "accounts": [
        {
          "name": "batch",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "batch"
          ]
        }
      ],
      "args": [
        {
          "name": "revealedTotal",
          "type": "u64"
        },
        {
          "name": "revealedCount",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createBatch",
      "docs": [
        "Initialize a new batch."
      ],
      "discriminator": [
        159,
        198,
        248,
        43,
        248,
        31,
        235,
        86
      ],
      "accounts": [
        {
          "name": "batch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "string"
        },
        {
          "name": "side",
          "type": "u8"
        }
      ]
    },
    {
      "name": "markDistributed",
      "docs": [
        "Mark distribution as executed."
      ],
      "discriminator": [
        225,
        106,
        116,
        3,
        4,
        174,
        164,
        224
      ],
      "accounts": [
        {
          "name": "batch",
          "writable": true,
          "relations": [
            "distribution"
          ]
        },
        {
          "name": "distribution",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "batch"
          ]
        }
      ],
      "args": [
        {
          "name": "txSignature",
          "type": "string"
        }
      ]
    },
    {
      "name": "recordDistribution",
      "docs": [
        "Record a distribution (revealed from MPC)."
      ],
      "discriminator": [
        35,
        239,
        115,
        184,
        162,
        108,
        209,
        36
      ],
      "accounts": [
        {
          "name": "batch",
          "writable": true
        },
        {
          "name": "distribution",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "batch"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "orderIndex",
          "type": "u8"
        },
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "wallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "recordExecution",
      "docs": [
        "Record execution result from DFlow."
      ],
      "discriminator": [
        231,
        245,
        144,
        129,
        178,
        195,
        89,
        160
      ],
      "accounts": [
        {
          "name": "batch",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "batch"
          ]
        }
      ],
      "args": [
        {
          "name": "totalShares",
          "type": "u64"
        },
        {
          "name": "txSignature",
          "type": "string"
        }
      ]
    },
    {
      "name": "recordOrder",
      "docs": [
        "Record that an order was submitted.",
        "The actual amount is hidden in the MPC."
      ],
      "discriminator": [
        142,
        220,
        120,
        190,
        0,
        153,
        119,
        120
      ],
      "accounts": [
        {
          "name": "batch",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "batch"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "batch",
      "discriminator": [
        156,
        194,
        70,
        44,
        22,
        88,
        137,
        44
      ]
    },
    {
      "name": "distribution",
      "discriminator": [
        176,
        85,
        17,
        11,
        13,
        194,
        18,
        1
      ]
    }
  ],
  "events": [
    {
      "name": "batchClosed",
      "discriminator": [
        192,
        76,
        201,
        211,
        10,
        212,
        139,
        232
      ]
    },
    {
      "name": "batchCreated",
      "discriminator": [
        231,
        92,
        210,
        203,
        2,
        59,
        109,
        234
      ]
    },
    {
      "name": "distributionExecuted",
      "discriminator": [
        120,
        132,
        182,
        5,
        60,
        75,
        183,
        95
      ]
    },
    {
      "name": "distributionRecorded",
      "discriminator": [
        84,
        56,
        187,
        206,
        131,
        85,
        136,
        227
      ]
    },
    {
      "name": "executionRecorded",
      "discriminator": [
        231,
        133,
        106,
        58,
        31,
        56,
        123,
        10
      ]
    },
    {
      "name": "orderRecorded",
      "discriminator": [
        43,
        225,
        76,
        203,
        41,
        27,
        170,
        4
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "batchNotOpen",
      "msg": "Batch is not open"
    },
    {
      "code": 6001,
      "name": "batchEmpty",
      "msg": "Batch is empty"
    },
    {
      "code": 6002,
      "name": "batchNotClosed",
      "msg": "Batch is not closed"
    },
    {
      "code": 6003,
      "name": "batchNotExecuted",
      "msg": "Batch is not executed"
    },
    {
      "code": 6004,
      "name": "alreadyDistributed",
      "msg": "Already distributed"
    },
    {
      "code": 6005,
      "name": "countMismatch",
      "msg": "Order count mismatch"
    }
  ],
  "types": [
    {
      "name": "batch",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "string"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "batchStatus"
              }
            }
          },
          {
            "name": "orderCount",
            "type": "u8"
          },
          {
            "name": "totalUsdc",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "distributionsCompleted",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "batchClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "totalUsdc",
            "type": "u64"
          },
          {
            "name": "orderCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "batchCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "string"
          },
          {
            "name": "side",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "batchStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "closed"
          },
          {
            "name": "executed"
          },
          {
            "name": "distributing"
          },
          {
            "name": "completed"
          }
        ]
      }
    },
    {
      "name": "distribution",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "orderIndex",
            "type": "u8"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "executed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "distributionExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "orderIndex",
            "type": "u8"
          },
          {
            "name": "txSignature",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "distributionRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "orderIndex",
            "type": "u8"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "executionRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "txSignature",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "orderRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batch",
            "type": "pubkey"
          },
          {
            "name": "orderCount",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
