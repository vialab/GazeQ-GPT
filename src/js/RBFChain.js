class MarkovChain {
    constructor() {
        this.system = {};
        this.current_origin = null;
        this.current_destination = null;
    }

    update(origin, destination, alpha) {
        origin = origin.toFixed(2);
        destination = destination.toFixed(2);

        if (origin !== destination || (!this.current_origin && !this.current_destination)) {
            this.current_origin = origin;
            this.current_destination = destination;
        }

        if (!(this.current_origin in this.system)) {
            this.system[this.current_origin] = {};
        }

        if (!(this.current_destination in this.system[this.current_origin])) {
            this.system[this.current_origin][this.current_destination] = 0.0;
        }

        for (let possible_destination in this.system[this.current_origin]) {
            if (possible_destination === this.current_destination) {
                this.system[this.current_origin][possible_destination] += alpha;

                if (this.system[this.current_origin][possible_destination] > 1) {
                    this.system[this.current_origin][possible_destination] = 1;
                }
            } else {
                let reduction_factor = alpha / (Object.keys(this.system[this.current_origin]).length - 1);
                this.system[this.current_origin][possible_destination] -= reduction_factor;

                if (this.system[this.current_origin][possible_destination] < 0) {
                    this.system[this.current_origin][possible_destination] = 0;
                }
            }
        }
        return this.system[this.current_origin][this.current_destination];
    }
}

export default class RBFChain {
    constructor(sigma=2, lambda_=0.5, alpha=0.25, delta=1.0) {
        this.sigma = sigma;
        this.lambda_ = lambda_;
        this.alpha = alpha;
        this.delta = delta;
        this.actual_center = null;
        this.centers = [];
        this.sample_count = 0;
        this.markov = new MarkovChain();
        this.reset();
    }

    reset() {
        this.sample_count = 1;
    }

    add_element(input_data) {
        this.sample_count += 1;
        let activation = 0.0;
        let activation_lambda = this.lambda_;
        let distance = 0.0;
        let activated_center = null;

        for (let center of this.centers) {
            distance = Math.sqrt(Math.pow(input_data - center, 2.0));
            activation = Math.exp(-Math.pow(this.sigma * distance, 2));

            if (activation >= activation_lambda) {
                activated_center = center;
                activation_lambda = activation;
            }
        }

        if (!activated_center) {
            this.centers.push(input_data);
            activated_center = input_data;
        }

        if (this.actual_center === null) {
            this.actual_center = activated_center;
        }

        let probability = this.markov.update(
            this.actual_center, activated_center, this.alpha
        );

        if (probability >= this.delta && this.actual_center !== activated_center) {
            this.actual_center = activated_center;
        }
        return probability;
    }
}
