import {ProgressBar} from "react-bootstrap";
import _ from "lodash";

export class MemoryPartition {
    constructor(start, size) {
        this.start = start;
        this.size = size;
        this.usage = "Unallocated";
    }
}

export class Memory {
    constructor(size) {
        this.size = size
        this.partitions = [new MemoryPartition(0, size)]
    }

    /**
     * @param offset
     * @param aName
     * @param bName
     * @returns {number} The index of the new partition
     */
    partition(offset, aName, bName) {
        if (offset === this.size) {
            this.partitions[this.partitions.length - 1].usage = aName;
            return this.partitions.length - 1;
        }

        for (let i = 0; i < this.partitions.length; i++) {
            let partition = this.partitions[i];
            let partitionEnd = partition.start + partition.size;

            if (partition.start < offset && offset < partitionEnd) {
                let newPartition = new MemoryPartition(offset, partitionEnd - offset);
                if (newPartition.size > 0) {
                    this.partitions.splice(i + 1, 0, newPartition);
                    newPartition.usage = bName;
                }
                partition.usage = aName;
                partition.size = offset - partition.start;

                return i + 1;
            }
        }
    }

    visualize() {
        return this.partitions.map((partition, i) => {
            const colorMap = ['success', 'danger', 'warning', 'info'];
            let isUnused = partition.usage.toLowerCase() === "unused";
            return (<ProgressBar
                key={i}
                style={{width: `${partition.size / this.size * 100}%`}}
                variant={isUnused ? null : colorMap[i % colorMap.length]}
                isChild={true}
                label={`${partition.usage} (${partition.size}K)`}
            />);
        })
    }

    indices() {
        return Array.from(this.partitions.keys());
    }

    sizeSortedIndices() {
        return this.indices().sort((indexA, indexB) => {
            let sizeA = this.partitions[indexA].size;
            let sizeB = this.partitions[indexB].size;
            if (sizeA < sizeB) return -1;
            if (sizeA > sizeB) return 1;
            return 0;
        });
    }

    sizeSortedIndicesReverse() {
        return this.sizeSortedIndices().reverse();
    }

    getAvailablePartitionWithUsage(indices, requiredSize, usage) {
        usage = usage.toLowerCase();
        for (let i = 0; i < indices.length; i++) {
            let partition = this.partitions[indices[i]];
            if (partition.usage.toLowerCase() !== usage) {
                continue;
            }
            if (partition.size < requiredSize) {
                continue;
            }
            return partition;
        }
        return null;
    }

    sumSizesOfUsage(usage) {
        usage = usage.toLowerCase();
        let sum = 0;
        for (let i = 0; i < this.partitions.length; i++) {
            let partition = this.partitions[i];
            if (partition.usage.toLowerCase() !== usage) {
                continue;
            }
            sum += partition.size;
        }
        return sum;
    }

    tryCoalesce(usage) {
        usage = usage.toLowerCase();

        let partitionsCopy = _.cloneDeep(this.partitions);

        let didSomething;
        do {
            didSomething = false;
            for (let i = 1; i < partitionsCopy.length; i++) {
                let partition = partitionsCopy[i];
                if (partition.usage.toLowerCase() !== usage) {
                    continue;
                }
                let prevPartition = partitionsCopy[i - 1];
                if (partition.usage !== prevPartition.usage) {
                    continue;
                }

                didSomething = true;

                let combined = new MemoryPartition(prevPartition.start, partition.size + prevPartition.size);
                combined.usage = prevPartition.usage;
                partitionsCopy.splice(i - 1, 2, combined);
                break;
            }
        } while (didSomething);

        this.partitions = partitionsCopy;
    }

    tryCompact(ignoreUsage) {
        const ignoreUsageLC = ignoreUsage.toLowerCase();

        let offset = 0;
        let newPartitions = [];
        for (let i = 0; i < this.partitions.length; i++) {
            let partition = this.partitions[i];
            if (partition.usage.toLowerCase() === ignoreUsageLC) {
                continue;
            }
            let newPartition = new MemoryPartition(offset, partition.size);
            newPartition.usage = partition.usage;
            newPartitions.push(newPartition);
            offset += partition.size;
        }

        if (offset < this.size) {
            let newPartition = new MemoryPartition(offset, this.size - offset);
            newPartition.usage = ignoreUsage;
            newPartitions.push(newPartition);
        }

        this.partitions = newPartitions;
    }
}