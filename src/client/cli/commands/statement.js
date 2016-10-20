// @flow

const RestClient = require('../../api/RestClient')

module.exports = {
  command: 'statement <statementId>',
  description: 'retrieve a statement by its id\n',
  handler: (opts: {statementId: string, apiUrl: string}) => {
    const {statementId, apiUrl} = opts
    const client = new RestClient({apiUrl})

    client.statement(statementId)
      .then(
        statement => console.dir(statement, {colors: true}),
        err => console.error(err.message)
      )
  }
}
