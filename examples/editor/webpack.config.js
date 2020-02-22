const CopyPlugin = require('copy-webpack-plugin');
var path = require('path');

module.exports = {
  entry: "./src/app.js",
  devServer: {
    contentBase: path.resolve(__dirname, 'dist'),
    port: 3000
  },
  output: {
    path: __dirname + "/dist",
    filename: "bundle.js"
  },
  mode: 'development',
  resolve: {
    alias: {
    },
    extensions: ['.js', '.ts', '.svg']
  },
  module: {
    rules: [{
      test: /\.js$/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env']
        }
      },
    }, {
      test: /\.ts$/,
      use: [{
        loader: 'ts-loader',
        options: {
          compilerOptions: {
            declaration: false,
            target: 'es5',
            module: 'commonjs'
          },
          transpileOnly: true
        }
      }]
    }, {
      test: /\.svg$/,
      use: [{
        loader: 'html-loader',
        options: {
          minimize: true
        }
      }]
    }, {
      test: /\.css$/i,
      use: ['style-loader', 'css-loader'],
    }],
  },
  plugins: [
    new CopyPlugin([
      { from: 'src/index.html', to: 'index.html' },
    ]),
  ],
}
