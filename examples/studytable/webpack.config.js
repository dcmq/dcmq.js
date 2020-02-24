const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      }
    ]
  },
  resolve: {
    extensions: ['*', '.js', '.jsx']
  },
  output: {
    path: __dirname + '/dist',
    publicPath: '/',
    filename: 'bundle.js'
  },
  plugins: [
    new CopyPlugin([
      {
        from: 'src/index.html',
        to: ''
      },
      {
        from: 'src/bootstrap.css',
        to: ''
      },
      {
        from: 'src/bootstrap-theme.css',
        to: ''
      },
    ]),
  ],
  devServer: {
    contentBase: './dist',
    port: 8089,
    host: '0.0.0.0'
  }
};