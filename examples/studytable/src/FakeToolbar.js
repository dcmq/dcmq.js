import React,{Component} from 'react';

export default class FakeToolbar extends Component {
    constructor(props) {
        super(props);
    }

    componentDidMount() {
        this.props.onToggleFilter();
    }

    render() {
        return (
            <div>
                {this.props.children}
            </div>
        );
    }
}